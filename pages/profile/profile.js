const { fetchProfile } = require("../../services/profile.service");
const { fetchCurrentUser } = require("../../services/user.service");
const { getAccessToken, logout } = require("../../services/auth.service");
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
  const loginMode = String(user.loginMode || "").trim();
  const loggedIn = !!user.loggedIn;

  return {
    useMock: false,
    baseURL: String(runtimeConfig.baseURL || ""),
    hasToken: !!accessToken,
    loggedIn,
    loginMode: loginMode || (loggedIn ? "active-session" : "guest"),
    userId: String(user.id || ""),
    userName: String(user.nickname || user.name || ""),
    modeLabel: "真实接口",
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

function bumpSidebarDataVersion() {
  const app = typeof getApp === "function" ? getApp() : null;
  if (!app || !app.globalData) {
    return;
  }

  app.globalData.sidebarDataVersion = Number(app.globalData.sidebarDataVersion || 0) + 1;
}

Page({
  data: {
    loading: true,
    error: false,
    accountBusy: false,
    accountError: "",
    navMetrics: getNavMetrics(),
    headerStyle: "",
    updateMode: false,
    profile: {
      initial: "\u5c0f",
      name: "\u5c0f\u660e",
      byline: "\u6765\u81ea \u4e00\u6811\u00b7\u6316\u5b9d",
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

  onLoad(options) {
    this.syncLayout();
    this.syncRuntimeState();
    
    if (options && options.mode === "update") {
      const pending = wx.getStorageSync("pendingAssetUpdates");
      if (pending) {
        this.setData({ updateMode: true, pendingUpdates: pending });
      }
    }

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

        let merged = mergeProfileWithUser(data || {}, user);
        
        if (this.data.updateMode && this.data.pendingUpdates) {
          const p = this.data.pendingUpdates;
          merged = {
            ...merged,
            radar: merged.radar.map(r => {
              const up = p.radar.find(ur => ur.label === r.label);
              return up ? { ...r, value: up.value, changed: up.changed } : r;
            }),
            strengths: [
              ...merged.strengths.map(s => ({ label: s })),
              ...(p.strengths || []).map(s => ({ ...s }))
            ],
            traits: [
              ...merged.traits.map(t => ({ ...t })),
              ...(p.traits || []).map(t => ({ ...t }))
            ],
            ikigai: p.ikigai || merged.ikigai,
            ikigaiChanged: p.ikigaiChanged
          };
        }

        this.setData({
          loading: false,
          error: false,
          profile: merged
        });
      })
      .catch(() => {
        const app = typeof getApp === "function" ? getApp() : null;
        const user = (app && app.globalData && app.globalData.user) || {};

        this.setData({
          loading: false,
          error: true,
          profile: mergeProfileWithUser(this.data.profile, user)
        });
      });
  },

  handleRetry() {
    this.loadProfile();
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
      bumpSidebarDataVersion();

      this.setData({
        profile: mergeProfileWithUser(profile || {}, nextUser),
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
        accountError: "同步失败，请检查登录状态或后端服务"
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
      bumpSidebarDataVersion();

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

    });
  },

  handleAcceptUpdate() {
    const p = this.data.profile;
    const cleanProfile = {
      ...p,
      radar: p.radar.map(r => ({ label: r.label, value: r.value })),
      strengths: p.strengths.map(s => s.label || s),
      traits: p.traits.map(t => ({ label: t.label, tone: t.tone })),
      ikigai: p.ikigai
    };

    // In a real app, send API request here
    this.setData({
      profile: cleanProfile,
      updateMode: false
    });

    wx.removeStorageSync("pendingAssetUpdates");
    wx.showToast({ title: "资产已合并更新", icon: "success" });
    
    setTimeout(() => {
      wx.navigateBack();
    }, 1500);
  },

  handleRejectUpdate() {
    this.setData({ updateMode: false });
    wx.removeStorageSync("pendingAssetUpdates");
    wx.navigateBack();
  }
});
