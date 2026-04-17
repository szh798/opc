const { fetchProfile } = require("../../services/profile.service");
const { getAccessToken, logout } = require("../../services/auth.service");
const { getNavMetrics } = require("../../utils/nav");
const { buildDisplayUser } = require("../../utils/user-display");

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
  const displayUser = buildDisplayUser(
    {
      ...profile,
      ...user,
      name: String(user.nickname || user.name || profile.name || "访客").trim() || "访客",
      avatarUrl: String(user.avatarUrl || profile.avatarUrl || "").trim()
    },
    {
      fallbackName: "访客",
      fallbackInitial: "访"
    }
  );

  return {
    ...profile,
    name: displayUser.name,
    initial: displayUser.initial,
    avatarUrl: displayUser.avatarUrl,
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
  const isDevEnv = String(runtimeConfig.env || "").trim() !== "prod";
  const debugInfoVisible = isDevEnv && !loggedIn;

  return {
    useMock: false,
    baseURL: String(runtimeConfig.baseURL || ""),
    hasToken: !!accessToken,
    loggedIn,
    loginMode: loginMode || (loggedIn ? "active-session" : "guest"),
    userId: String(user.id || ""),
    userName: String(user.nickname || user.name || ""),
    modeLabel: "真实接口",
    authLabel: loggedIn ? "已登录" : "未登录",
    devPanelVisible: debugInfoVisible,
    debugInfoVisible,
    accountCardVisible: debugInfoVisible || loggedIn
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
    hasRealProfile: false,
    accountBusy: false,
    accountError: "",
    profileAvatarLoadFailed: false,
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
      avatarUrl: "",
      assetReport: {
        hasReport: false,
        finalReport: "",
        reportBrief: "",
        reportVersion: "",
        generatedAt: "",
        isReview: false,
        sections: []
      }
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

  handleBack() {
    wx.navigateBack({ fail: () => wx.switchTab && wx.switchTab({ url: "/pages/index/index" }) });
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
      profile: mergedProfile,
      profileAvatarLoadFailed: false
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

        const hasRealProfile = Array.isArray(merged.radar)
          && merged.radar.length > 0
          && merged.radar.some(r => r.value > 0);

        this.setData({
          loading: false,
          error: false,
          hasRealProfile,
          profile: merged,
          profileAvatarLoadFailed: false
        });
      })
      .catch(() => {
        const app = typeof getApp === "function" ? getApp() : null;
        const user = (app && app.globalData && app.globalData.user) || {};

        const errorProfile = mergeProfileWithUser(this.data.profile, user);
        this.setData({
          loading: false,
          error: true,
          hasRealProfile: Array.isArray(errorProfile.radar) && errorProfile.radar.some(r => r.value > 0),
          profile: errorProfile,
          profileAvatarLoadFailed: false
        });
      });
  },

  handleRetry() {
    this.loadProfile();
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
        profile: mergeProfileWithUser(this.data.profile, nextUser),
        profileAvatarLoadFailed: false
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
  },

  handleProfileAvatarError() {
    if (this.data.profileAvatarLoadFailed) {
      return;
    }

    this.setData({
      profileAvatarLoadFailed: true
    });
  }
});
