const { getProfile, fetchProfile } = require("../../services/profile.service");
const { fetchCurrentUser } = require("../../services/user.service");
const { getAccessToken, logout } = require("../../services/auth.service");
const { isMockMode, setRequestMockMode } = require("../../services/request");
const { getNavMetrics } = require("../../utils/nav");

function buildStageLabel(user = {}, fallback = "") {
  const stage = String(user.stage || "").trim();
  const streakDays = Number(user.streakDays);

  if (!stage) {
    return fallback;
  }

  if (Number.isFinite(streakDays) && streakDays > 0) {
    return `${stage} · 连续打卡 ${streakDays} 天`;
  }

  return stage;
}

function mergeProfileWithUser(profile = {}, user = {}) {
  const nextName = String(user.nickname || user.name || profile.name || "小明").trim() || "小明";

  return {
    ...profile,
    name: nextName,
    initial: String(user.initial || nextName.slice(0, 1) || profile.initial || "小").trim() || "小",
    avatarUrl: String(user.avatarUrl || profile.avatarUrl || "").trim(),
    stageLabel: buildStageLabel(user, profile.stageLabel || "")
  };
}

function buildRuntimeState() {
  const app = typeof getApp === "function" ? getApp() : null;
  const runtimeConfig = (app && app.globalData && app.globalData.runtimeConfig) || {};
  const user = (app && app.globalData && app.globalData.user) || {};
  const accessToken = getAccessToken();
  const mockEnabled = isMockMode();
  const loginMode = String(user.loginMode || "").trim();
  const loggedIn = !!user.loggedIn;

  return {
    useMock: mockEnabled,
    baseURL: String(runtimeConfig.baseURL || ""),
    hasToken: !!accessToken,
    loggedIn,
    loginMode: loginMode || (loggedIn ? "active-session" : "guest"),
    userId: String(user.id || ""),
    userName: String(user.nickname || user.name || ""),
    modeLabel: mockEnabled ? "Mock 联调" : "真实接口",
    authLabel: loggedIn ? "已登录" : "未登录"
  };
}

function syncAppUser(nextUser = {}) {
  const app = typeof getApp === "function" ? getApp() : null;

  if (app && app.globalData) {
    app.globalData.user = {
      ...app.globalData.user,
      ...nextUser
    };
  }

  return (app && app.globalData && app.globalData.user) || nextUser;
}

Page({
  data: {
    loading: true,
    error: false,
    accountBusy: false,
    accountError: "",
    navMetrics: getNavMetrics(),
    headerStyle: "",
    profile: {
      initial: "\u5c0f",
      name: "\u5c0f\u660e",
      byline: "by \u4e00\u6811\u00b7\u6316\u5b9d",
      stageLabel: "",
      radar: [],
      strengths: [],
      traits: [],
      avatarUrl: ""
    },
    runtime: {
      useMock: false,
      baseURL: "",
      hasToken: false,
      loggedIn: false,
      loginMode: "guest",
      userId: "",
      userName: "",
      modeLabel: "",
      authLabel: ""
    }
  },

  onLoad() {
    this.syncLayout();
    this.syncRuntimeState();
    this.loadProfile();
  },

  onShow() {
    this.syncLayout();
    this.syncRuntimeState();
  },

  syncLayout() {
    const navMetrics = getNavMetrics(true);

    this.setData({
      navMetrics,
      headerStyle: `padding-top: ${navMetrics.headerTop}px; min-height: ${navMetrics.headerTop + navMetrics.menuHeight + 18}px;`
    });
  },

  syncRuntimeState(extraUser = null) {
    const appUser = extraUser || ((typeof getApp === "function" && getApp().globalData && getApp().globalData.user) || {});
    const mergedProfile = mergeProfileWithUser(this.data.profile, appUser);

    this.setData({
      runtime: buildRuntimeState(),
      profile: mergedProfile
    });
  },

  loadProfile() {
    this.setData({
      loading: true,
      error: false
    });

    fetchProfile()
      .then((data) => {
        const app = typeof getApp === "function" ? getApp() : null;
        const user = (app && app.globalData && app.globalData.user) || {};

        this.setData({
          loading: false,
          error: false,
          profile: mergeProfileWithUser(data || getProfile(), user)
        });
      })
      .catch(() => {
        const app = typeof getApp === "function" ? getApp() : null;
        const user = (app && app.globalData && app.globalData.user) || {};

        this.setData({
          loading: false,
          error: true,
          profile: mergeProfileWithUser(getProfile(), user)
        });
      });
  },

  handleRetry() {
    this.loadProfile();
  },

  handleToggleMock() {
    if (this.data.accountBusy) {
      return;
    }

    const nextEnabled = setRequestMockMode(!this.data.runtime.useMock);
    this.syncRuntimeState();
    this.loadProfile();

    wx.showToast({
      title: nextEnabled ? "已切到 Mock 联调" : "已切到真实接口",
      icon: "none"
    });
  },

  async handleSyncAccount() {
    if (this.data.accountBusy) {
      return;
    }

    this.setData({
      accountBusy: true,
      accountError: ""
    });

    try {
      const [profile, user] = await Promise.all([fetchProfile(), fetchCurrentUser()]);
      const nextUser = syncAppUser(user || {});

      this.setData({
        profile: mergeProfileWithUser(profile || getProfile(), nextUser),
        accountBusy: false,
        accountError: ""
      });

      this.syncRuntimeState(nextUser);

      wx.showToast({
        title: "已同步当前状态",
        icon: "none"
      });
    } catch (error) {
      this.setData({
        accountBusy: false,
        accountError: "同步失败，已保留当前页面数据"
      });
    }
  },

  async handleLogout() {
    if (this.data.accountBusy) {
      return;
    }

    this.setData({
      accountBusy: true,
      accountError: ""
    });

    try {
      await logout();
      const app = typeof getApp === "function" ? getApp() : null;
      const currentUser = (app && app.globalData && app.globalData.user) || {};
      const nextUser = syncAppUser({
        ...currentUser,
        loggedIn: false,
        loginMode: "",
        openId: "",
        unionId: ""
      });

      this.setData({
        accountBusy: false,
        accountError: "",
        profile: mergeProfileWithUser(this.data.profile, nextUser)
      });

      this.syncRuntimeState(nextUser);

      wx.showToast({
        title: "已退出登录",
        icon: "none"
      });
    } catch (error) {
      this.setData({
        accountBusy: false,
        accountError: "退出失败，请稍后重试"
      });
    }
  },

  handleBack() {
    wx.navigateBack({
      fail: () => {
        wx.reLaunch({
          url: "/pages/welcome/welcome"
        });
      }
    });
  }
});
