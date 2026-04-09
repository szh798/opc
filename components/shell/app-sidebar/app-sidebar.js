const { getNavMetrics } = require("../../../utils/nav");

Component({
  options: {
    addGlobalClass: true
  },

  observers: {
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
    renderRecentChats: []
  },

  lifetimes: {
    attached() {
      this.syncLayout();
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

    syncRecentChatList(activeId = this.openRecentChatId || "", dragId = "", dragOffsetX = 0) {
      const recentChats = Array.isArray(this.properties.recentChats) ? this.properties.recentChats : [];
      const renderRecentChats = recentChats.map((item) => {
        let offsetX = 0;

        if (item.id === dragId) {
          offsetX = dragOffsetX;
        } else if (item.id === activeId) {
          offsetX = -this.getDeleteWidth();
        }

        return {
          ...item,
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
      const currentOpenRecentChatId = this.openRecentChatId || "";
      const { id } = event.currentTarget.dataset;

      if (currentOpenRecentChatId) {
        this.closeOpenRecentChat();
        return;
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
      const threshold = this.getDeleteWidth() / 2;
      const finalOffsetX = Math.min(0, Math.max(-this.getDeleteWidth(), this.touchStartOffsetX + deltaX));

      this.openRecentChatId = Math.abs(finalOffsetX) >= threshold ? this.touchRecentChatId : "";
      this.touchRecentChatId = "";
      this.touchMoving = false;
      this.syncRecentChatList(this.openRecentChatId || "");
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
