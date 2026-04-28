const { fetchBootstrap } = require("../../services/bootstrap.service");
const { fetchCurrentUser, updateCurrentUser } = require("../../services/user.service");
const { clearRecentChats } = require("../../services/chat.service");
const { getAccessToken, logout } = require("../../services/auth.service");
const { ensureLoggedIn } = require("../../utils/auth-guard");
const { getNavMetrics } = require("../../utils/nav");
const { normalizeAvatarUrl, resolveAvatarAfterError } = require("../../utils/user-display");
const { resolveAvatarRenderUrl } = require("../../utils/avatar-render");

function buildRuntimeState() {
  const app = typeof getApp === "function" ? getApp() : null;
  const runtimeConfig = (app && app.globalData && app.globalData.runtimeConfig) || {};
  const user = (app && app.globalData && app.globalData.user) || {};
  const accessToken = getAccessToken();
  const loginMode = String(user.loginMode || "").trim();
  const loggedIn = !!user.loggedIn;

  return {
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

function mergeUserState(source = {}, fallback = {}) {
  const nextName = String(source.nickname || source.name || fallback.nickname || fallback.name || "").trim();

  return {
    ...fallback,
    ...source,
    name: nextName || String(fallback.name || "").trim(),
    nickname: nextName || String(fallback.nickname || fallback.name || "").trim(),
    initial: String(source.initial || fallback.initial || nextName.slice(0, 1) || "游").trim() || "游",
    avatarUrl: normalizeAvatarUrl(source.avatarUrl || fallback.avatarUrl)
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
    navMetrics: getNavMetrics(),
    headerStyle: "",
    loading: true,
    accountBusy: false,
    accountError: "",
    settingsAvatarLoadFailed: false,
    displayAvatarUrl: "",
    nicknameBusy: false,
    recentChatsBusy: false,
    user: {
      initial: "游",
      name: "",
      nickname: "",
      avatarUrl: ""
    },
    runtime: {
      baseURL: "",
      hasToken: false,
      loggedIn: false,
      loginMode: "guest",
      userId: "",
      userName: "",
      modeLabel: "",
      authLabel: ""
    },
    recentChats: []
  },

  onLoad() {
    if (!ensureLoggedIn()) {
      return;
    }

    this.syncLayout();
    this.loadSettingsData();
  },

  onShow() {
    if (!ensureLoggedIn()) {
      return;
    }

    this.syncLayout();
    this.setData({
      runtime: buildRuntimeState()
    });
    this.syncAvatarState(this.data.user.avatarUrl);
  },

  syncLayout() {
    const navMetrics = getNavMetrics(true);

    this.setData({
      navMetrics,
      headerStyle: `padding-top: ${navMetrics.headerTop}px; min-height: ${navMetrics.headerTop + navMetrics.menuHeight + 18}px;`
    });
  },

  syncAvatarState(sourceAvatarUrl) {
    const normalizedAvatarUrl = normalizeAvatarUrl(sourceAvatarUrl);
    this.avatarResolveToken = Number(this.avatarResolveToken || 0) + 1;
    const resolveToken = this.avatarResolveToken;

    this.setData({
      displayAvatarUrl: normalizedAvatarUrl,
      settingsAvatarLoadFailed: false
    });

    resolveAvatarRenderUrl(normalizedAvatarUrl).then((resolvedAvatarUrl) => {
      const nextAvatarUrl = String(resolvedAvatarUrl || "").trim();
      if (!nextAvatarUrl || nextAvatarUrl === normalizedAvatarUrl || resolveToken !== this.avatarResolveToken) {
        return;
      }

      this.setData({
        displayAvatarUrl: nextAvatarUrl,
        settingsAvatarLoadFailed: false
      });
    });
  },

  async loadSettingsData() {
    const app = typeof getApp === "function" ? getApp() : null;
    const appUser = (app && app.globalData && app.globalData.user) || {};

    this.setData({
      loading: true,
      runtime: buildRuntimeState()
    });

    try {
      let currentUser = null;
      try {
        currentUser = await fetchCurrentUser();
      } catch (error) {
        if (!getAccessToken()) {
          syncAppUser({
            loggedIn: false,
            loginMode: "guest"
          });
          this.setData({
            loading: false,
            runtime: buildRuntimeState()
          });
          ensureLoggedIn();
          return;
        }
        throw error;
      }

      const bootstrapPayload = await fetchBootstrap().catch(() => null);

      const mergedUser = mergeUserState(
        (currentUser && typeof currentUser === "object" ? currentUser : {}) ||
          (bootstrapPayload && bootstrapPayload.user) ||
          {},
        appUser
      );

      syncAppUser(mergedUser);

      this.setData({
        loading: false,
        accountError: "",
        user: mergedUser,
        runtime: buildRuntimeState(),
        recentChats: Array.isArray(bootstrapPayload && bootstrapPayload.recentChats) ? bootstrapPayload.recentChats : []
      });
      this.syncAvatarState(mergedUser.avatarUrl);
    } catch (error) {
      this.setData({
        loading: false,
        accountError: "设置数据加载失败，请检查后端服务",
        settingsAvatarLoadFailed: false,
        user: mergeUserState({}, appUser),
        runtime: buildRuntimeState(),
        recentChats: []
      });
      this.syncAvatarState(this.data.user.avatarUrl);
    }
  },

  handleBack() {
    wx.navigateBack({
      fail: () => {
        wx.reLaunch({
          url: "/pages/conversation/conversation"
        });
      }
    });
  },

  handleOpenProfile() {
    wx.navigateTo({
      url: "/pages/profile/profile"
    });
  },

  handleOpenLegal(event) {
    const type = event.currentTarget.dataset.type === "privacy" ? "privacy" : "terms";
    wx.navigateTo({
      url: `/pages/legal/legal?type=${type}`
    });
  },

  handleOpenHelp() {
    wx.showModal({
      title: "使用帮助",
      content: "侧边栏里的最近聊天支持左滑删除；设置页可以清空最近聊天、同步账号状态、修改昵称和退出登录。",
      showCancel: false
    });
  },

  handleEditNickname() {
    if (this.data.nicknameBusy) {
      return;
    }

    if (!this.data.runtime.loggedIn || !this.data.runtime.hasToken) {
      wx.showToast({
        title: "登录后可修改昵称",
        icon: "none"
      });
      return;
    }

    this.setData({
      nicknameBusy: true
    });

    wx.showModal({
      title: "修改昵称",
      editable: true,
      placeholderText: this.data.user.nickname || this.data.user.name || "输入新的昵称",
      confirmText: "保存",
      success: async (result) => {
        if (!result.confirm) {
          this.setData({
            nicknameBusy: false
          });
          return;
        }

        const nickname = String(result.content || "").trim().slice(0, 12);
        if (!nickname) {
          this.setData({
            nicknameBusy: false
          });
          wx.showToast({
            title: "昵称不能为空",
            icon: "none"
          });
          return;
        }

        try {
          const nextUser = await updateCurrentUser({
            name: nickname,
            nickname,
            initial: nickname.slice(0, 1)
          });

          const mergedUser = mergeUserState(nextUser || {}, this.data.user);
          syncAppUser(mergedUser);
          bumpSidebarDataVersion();

          this.setData({
            user: mergedUser,
            runtime: buildRuntimeState(),
            settingsAvatarLoadFailed: false,
            nicknameBusy: false
          });
          this.syncAvatarState(mergedUser.avatarUrl);

          wx.showToast({
            title: "昵称已更新",
            icon: "none"
          });
        } catch (error) {
          this.setData({
            nicknameBusy: false
          });
          wx.showToast({
            title: "昵称更新失败",
            icon: "none"
          });
        }
      },
      fail: () => {
        this.setData({
          nicknameBusy: false
        });
      }
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
      await this.loadSettingsData();
      bumpSidebarDataVersion();
      this.setData({
        accountBusy: false
      });

      wx.showToast({
        title: "已同步最新状态",
        icon: "none"
      });
    } catch (error) {
      this.setData({
        accountBusy: false,
        accountError: "同步失败，请稍后重试"
      });
    }
  },

  async handleLogout() {
    if (this.data.accountBusy) {
      return;
    }

    if (!this.data.runtime.loggedIn) {
      wx.showToast({
        title: "当前未登录",
        icon: "none"
      });
      return;
    }

    this.setData({
      accountBusy: true,
      accountError: ""
    });

    try {
      await logout();
      const mergedUser = syncAppUser({
        ...this.data.user,
        loggedIn: false,
        loginMode: "",
        openId: "",
        unionId: ""
      });
      const nextUser = mergeUserState({}, mergedUser);
      bumpSidebarDataVersion();

      this.setData({
        accountBusy: false,
        settingsAvatarLoadFailed: false,
        user: nextUser,
        runtime: buildRuntimeState()
      });
      this.syncAvatarState(nextUser.avatarUrl);

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

  handleSettingsAvatarError() {
    const fallbackAvatarUrl = resolveAvatarAfterError(this.data.displayAvatarUrl);
    if (fallbackAvatarUrl) {
      this.setData({
        displayAvatarUrl: fallbackAvatarUrl,
        settingsAvatarLoadFailed: false
      });
      return;
    }

    if (this.data.settingsAvatarLoadFailed) {
      return;
    }

    this.setData({
      settingsAvatarLoadFailed: true
    });
  },

  handleClearRecentChats() {
    if (this.data.recentChatsBusy) {
      return;
    }

    if (!this.data.recentChats.length) {
      wx.showToast({
        title: "最近聊天已经为空",
        icon: "none"
      });
      return;
    }

    wx.showModal({
      title: "清空最近聊天",
      content: "清空后，侧边栏中的最近聊天会全部移除。",
      confirmText: "清空",
      confirmColor: "#da4d37",
      success: async (result) => {
        if (!result.confirm) {
          return;
        }

        this.setData({
          recentChatsBusy: true
        });

        try {
          await clearRecentChats();
          bumpSidebarDataVersion();
          this.setData({
            recentChatsBusy: false,
            recentChats: []
          });

          wx.showToast({
            title: "已清空",
            icon: "none"
          });
        } catch (error) {
          this.setData({
            recentChatsBusy: false
          });
          wx.showToast({
            title: "清空最近聊天失败",
            icon: "none"
          });
        }
      }
    });
  }
});
