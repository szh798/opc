Component({
  options: {
    addGlobalClass: true,
    multipleSlots: true
  },

  properties: {
    agentKey: {
      type: String,
      value: "master"
    },
    user: {
      type: Object,
      value: {}
    },
    sidebarVisible: {
      type: Boolean,
      value: false
    },
    projects: {
      type: Array,
      value: []
    },
    tools: {
      type: Array,
      value: []
    },
    recentChats: {
      type: Array,
      value: []
    },
    inputPlaceholder: {
      type: String,
      value: "输入消息..."
    },
    inputValue: {
      type: String,
      value: ""
    },
    showBottomInput: {
      type: Boolean,
      value: true
    }
  },

  methods: {
    handleAvatarTap() {
      this.triggerEvent("avatartap");
    },

    handleTreeTap() {
      this.triggerEvent("treetap");
    },

    handleSidebarClose() {
      this.triggerEvent("sidebarclose");
    },

    handleProfileTap() {
      this.triggerEvent("profiletap");
    },

    handleNewChat() {
      this.triggerEvent("newchat");
    },

    handleToolTap(event) {
      this.triggerEvent("tooltap", event.detail);
    },

    handleProjectTap(event) {
      this.triggerEvent("projecttap", event.detail);
    },

    handleRecentTap(event) {
      this.triggerEvent("recenttap", event.detail);
    },

    handleRecentDelete(event) {
      this.triggerEvent("recentdelete", event.detail);
    },

    handleSettingTap() {
      this.triggerEvent("settingtap");
    },

    handleHelpTap() {
      this.triggerEvent("helptap");
    },

    handlePlusTap() {
      this.triggerEvent("plustap");
    },

    handleSend(event) {
      this.triggerEvent("send", event.detail);
    },

    handleInputChange(event) {
      this.triggerEvent("inputchange", event.detail);
    }
  }
});
