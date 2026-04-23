const { normalizeAvatarUrl, resolveAvatarAfterError } = require("../../../utils/user-display");
const { resolveAvatarRenderUrl } = require("../../../utils/avatar-render");

Component({
  options: {
    addGlobalClass: true
  },

  properties: {
    mode: {
      type: String,
      value: "pending"
    },
    title: {
      type: String,
      value: ""
    },
    description: {
      type: String,
      value: ""
    },
    buttonText: {
      type: String,
      value: ""
    },
    showDevFreshButton: {
      type: Boolean,
      value: false
    },
    devFreshButtonText: {
      type: String,
      value: ""
    },
    userName: {
      type: String,
      value: ""
    },
    userAvatarUrl: {
      type: String,
      value: ""
    }
  },

  data: {
    displayAvatarUrl: "",
    avatarLoadFailed: false,
    profileRequestPending: false
  },

  lifetimes: {
    attached() {
      this.syncAvatarState(this.properties.userAvatarUrl);
    }
  },

  observers: {
    userAvatarUrl(userAvatarUrl) {
      this.syncAvatarState(userAvatarUrl);
    }
  },

  methods: {
    syncAvatarState(userAvatarUrl) {
      const normalizedAvatarUrl = normalizeAvatarUrl(userAvatarUrl);
      this.avatarResolveToken = Number(this.avatarResolveToken || 0) + 1;
      const resolveToken = this.avatarResolveToken;

      this.setData({
        displayAvatarUrl: normalizedAvatarUrl,
        avatarLoadFailed: false
      });

      resolveAvatarRenderUrl(normalizedAvatarUrl).then((resolvedAvatarUrl) => {
        const nextAvatarUrl = String(resolvedAvatarUrl || "").trim();
        if (!nextAvatarUrl || nextAvatarUrl === normalizedAvatarUrl || resolveToken !== this.avatarResolveToken) {
          return;
        }

        this.setData({
          displayAvatarUrl: nextAvatarUrl,
          avatarLoadFailed: false
        });
      });
    },

    handleTap() {
      if (this.properties.mode === "done" || this.data.profileRequestPending) {
        return;
      }

      this.fetchProfileAndDispatch("action");
    },

    handleDevFreshTap() {
      if (this.properties.mode === "done" || this.data.profileRequestPending) {
        return;
      }

      this.fetchProfileAndDispatch("devfreshaction");
    },

    // 关键:wx.getUserProfile 必须在用户 tap 事件的同步上下文里发起,
    // 否则微信会以"非用户行为触发"为由拒绝弹授权框。所以把拉昵称的调用
    // 放在 triggerEvent 之前,且不要加 await。拿到 userInfo 后一起派发给父级。
    fetchProfileAndDispatch(eventName) {
      const dispatch = (detail) => {
        this.setData({
          profileRequestPending: false
        });
        this.triggerEvent(eventName, detail || { userInfo: null });
      };

      this.setData({
        profileRequestPending: true
      });

      if (typeof wx === "undefined" || typeof wx.getUserProfile !== "function") {
        dispatch({ userInfo: null });
        return;
      }

      wx.getUserProfile({
        desc: "用于完善资料与同步微信头像昵称",
        success: (result) => {
          const userInfo = (result && result.userInfo) || null;
          dispatch({
            userInfo,
            encryptedData: (result && result.encryptedData) || "",
            iv: (result && result.iv) || ""
          });
        },
        fail: () => {
          // 用户拒绝授权或 API 受限,仍然继续登录流程,
          // 后端会用动态占位名而不是 "小明"。
          dispatch({ userInfo: null });
        }
      });
    },

    handleAgreementTap(event) {
      this.triggerEvent("agreementtap", {
        type: event.currentTarget.dataset.type || ""
      });
    },

    handleAvatarError() {
      const fallbackAvatarUrl = resolveAvatarAfterError(this.data.displayAvatarUrl);
      if (fallbackAvatarUrl) {
        this.setData({
          displayAvatarUrl: fallbackAvatarUrl,
          avatarLoadFailed: false
        });
        return;
      }

      if (this.data.avatarLoadFailed) {
        return;
      }

      this.setData({
        avatarLoadFailed: true
      });
    }
  }
});
