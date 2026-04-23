const { getNavMetrics } = require("../../../utils/nav");
const { buildDisplayUser, resolveAvatarAfterError } = require("../../../utils/user-display");
const { resolveAvatarRenderUrl } = require("../../../utils/avatar-render");

Component({
  options: {
    addGlobalClass: true
  },

  observers: {
    user() {
      this.syncDisplayUser();
    },
    recentChats() {
      this.syncRecentChatList();
    }
  },

  properties: {
    visible: {
      type: Boolean,
      value: false
    },
    user: {
      type: Object,
      value: {}
    },
    projects: {
      type: Array,
      value: []
    },
    tools: {
      type: Array,
      value: []
    },
    activeToolKey: {
      type: String,
      value: ""
    },
    recentChats: {
      type: Array,
      value: []
    }
  },

  data: {
    panelStyle: "",
    renderRecentChats: [],
    displayUser: buildDisplayUser({}, {
      fallbackName: "访客",
      fallbackInitial: "游",
      subtitle: "点击查看我的档案"
    }),
    avatarLoadFailed: false
  },

  lifetimes: {
    attached() {
      this.syncLayout();
      this.syncDisplayUser();
      this.syncRecentChatList();
    }
  },

  pageLifetimes: {
    show() {
      this.syncLayout();
    }
  },

  methods: {
    syncLayout() {
      const navMetrics = getNavMetrics(true);
      this.setData({
        panelStyle: `padding-top: ${navMetrics.headerTop + 10}px;`
      });
    },

    syncDisplayUser() {
      this.setData({
        displayUser: buildDisplayUser(this.properties.user, {
          fallbackName: "访客",
          fallbackInitial: "游",
          subtitle: "点击查看我的档案"
        }),
        avatarLoadFailed: false
      }, () => {
        const sourceAvatarUrl = String((this.data.displayUser && this.data.displayUser.avatarUrl) || "").trim();
        this.avatarResolveToken = Number(this.avatarResolveToken || 0) + 1;
        const resolveToken = this.avatarResolveToken;

        resolveAvatarRenderUrl(sourceAvatarUrl).then((resolvedAvatarUrl) => {
          const nextAvatarUrl = String(resolvedAvatarUrl || "").trim();
          if (!nextAvatarUrl || nextAvatarUrl === sourceAvatarUrl || resolveToken !== this.avatarResolveToken) {
            return;
          }

          this.setData({
            displayUser: {
              ...this.data.displayUser,
              avatarUrl: nextAvatarUrl
            },
            avatarLoadFailed: false
          });
        });
      });
    },

    syncRecentChatList(activeId = this.openRecentChatId || "", dragId = "", dragOffsetX = 0) {
      const recentChats = Array.isArray(this.properties.recentChats) ? this.properties.recentChats : [];
      const renderRecentChats = recentChats.map((item) => {
        const normalizedId = String(
          (item && (item.id || item.conversationId || item.sessionId)) || ""
        ).trim();
        let offsetX = 0;

        if (normalizedId === dragId) {
          offsetX = dragOffsetX;
        } else if (normalizedId === activeId) {
          offsetX = -this.getDeleteWidth();
        }

        return {
          ...item,
          id: normalizedId,
          offsetX
        };
      });

      this.setData({
        renderRecentChats
      });
    },

    getDeleteWidth() {
      return 84;
    },

    closeOpenRecentChat() {
      this.openRecentChatId = "";
      this.syncRecentChatList();
    },

    handleMaskTap() {
      this.closeOpenRecentChat();
      this.triggerEvent("close");
    },

    handleProfileTap() {
      this.closeOpenRecentChat();
      this.triggerEvent("profiletap");
    },

    handleAvatarError() {
      const fallbackAvatarUrl = resolveAvatarAfterError(this.data.displayUser.avatarUrl);
      if (fallbackAvatarUrl) {
        this.setData({
          displayUser: {
            ...this.data.displayUser,
            avatarUrl: fallbackAvatarUrl
          },
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
    },

    handleNewChatTap() {
      this.closeOpenRecentChat();
      this.triggerEvent("newchat");
    },

    handleToolTap(event) {
      this.closeOpenRecentChat();
      this.triggerEvent("tooltap", {
        key: event.currentTarget.dataset.key
      });
    },

    handleProjectTap(event) {
      this.closeOpenRecentChat();
      this.triggerEvent("projecttap", {
        id: event.currentTarget.dataset.id
      });
    },

    handleRecentTap(event) {
      if (this.skipNextRecentTap) {
        this.skipNextRecentTap = false;
        return;
      }
      const currentOpenRecentChatId = this.openRecentChatId || "";
      const { id } = event.currentTarget.dataset;

      if (currentOpenRecentChatId) {
        // When swipe actions are open, close them first but still allow this tap
        // to select the target conversation immediately.
        this.closeOpenRecentChat();
      }

      this.triggerEvent("recenttap", {
        id
      });
    },

    handleRecentDelete(event) {
      const { id } = event.currentTarget.dataset;
      this.closeOpenRecentChat();
      this.triggerEvent("recentdelete", {
        id
      });
    },

    handleRecentTouchStart(event) {
      const touch = event.changedTouches && event.changedTouches[0];
      if (!touch) {
        return;
      }

      this.touchRecentChatId = event.currentTarget.dataset.id;
      this.touchStartX = touch.pageX;
      this.touchStartY = touch.pageY;
      this.touchStartOffsetX = this.openRecentChatId === this.touchRecentChatId ? -this.getDeleteWidth() : 0;
      this.touchMoving = false;
    },

    handleRecentTouchMove(event) {
      const touch = event.changedTouches && event.changedTouches[0];
      if (!touch || !this.touchRecentChatId) {
        return;
      }

      const deltaX = touch.pageX - this.touchStartX;
      const deltaY = touch.pageY - this.touchStartY;

      if (!this.touchMoving && Math.abs(deltaY) > Math.abs(deltaX)) {
        return;
      }

      this.touchMoving = true;

      const nextOffsetX = Math.min(0, Math.max(-this.getDeleteWidth(), this.touchStartOffsetX + deltaX));
      this.syncRecentChatList(this.openRecentChatId || "", this.touchRecentChatId, nextOffsetX);
    },

    handleRecentTouchEnd(event) {
      const touch = event.changedTouches && event.changedTouches[0];
      if (!touch || !this.touchRecentChatId) {
        this.closeOpenRecentChat();
        return;
      }

      const deltaX = touch.pageX - this.touchStartX;
      const deltaY = touch.pageY - this.touchStartY;
      const touchTargetId = this.touchRecentChatId;
      const threshold = this.getDeleteWidth() / 2;
      const finalOffsetX = Math.min(0, Math.max(-this.getDeleteWidth(), this.touchStartOffsetX + deltaX));

      this.openRecentChatId = Math.abs(finalOffsetX) >= threshold ? this.touchRecentChatId : "";
      this.touchRecentChatId = "";
      this.touchMoving = false;
      this.syncRecentChatList(this.openRecentChatId || "");

      const isTapLike =
        Math.abs(deltaX) <= 8 &&
        Math.abs(deltaY) <= 8 &&
        Math.abs(finalOffsetX) < threshold;
      if (isTapLike && touchTargetId) {
        this.skipNextRecentTap = true;
        this.triggerEvent("recenttap", {
          id: touchTargetId
        });
      }
    },

    handleRecentTouchCancel() {
      this.touchRecentChatId = "";
      this.touchMoving = false;
      this.syncRecentChatList(this.openRecentChatId || "");
    },

    handleSettingTap() {
      this.closeOpenRecentChat();
      this.triggerEvent("settingtap");
    },

    handleHelpTap() {
      this.closeOpenRecentChat();
      this.triggerEvent("helptap");
    }
  }
});
