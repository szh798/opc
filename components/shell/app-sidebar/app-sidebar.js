Component({
  options: {
    addGlobalClass: true
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

  methods: {
    handleMaskTap() {
      this.triggerEvent("close");
    },

    handleProfileTap() {
      this.triggerEvent("profiletap");
    },

    handleNewChatTap() {
      this.triggerEvent("newchat");
    },

    handleToolTap(event) {
      this.triggerEvent("tooltap", {
        key: event.currentTarget.dataset.key
      });
    },

    handleProjectTap(event) {
      this.triggerEvent("projecttap", {
        id: event.currentTarget.dataset.id
      });
    },

    handleRecentTap(event) {
      this.triggerEvent("recenttap", {
        id: event.currentTarget.dataset.id
      });
    },

    handleSettingTap() {
      this.triggerEvent("settingtap");
    },

    handleHelpTap() {
      this.triggerEvent("helptap");
    }
  }
});
