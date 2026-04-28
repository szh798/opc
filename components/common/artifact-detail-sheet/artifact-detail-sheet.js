Component({
  options: {
    addGlobalClass: true
  },

  properties: {
    visible: {
      type: Boolean,
      value: false
    },
    artifact: {
      type: Object,
      value: {}
    }
  },

  methods: {
    handleMaskTap() {
      this.triggerEvent("close");
    },

    handleSheetTap() {},

    handleClose() {
      this.triggerEvent("close");
    },

    handleContinue() {
      this.triggerEvent("continue", {
        artifact: this.data.artifact || {}
      });
    },

    handleShare() {
      this.triggerEvent("share", {
        artifact: this.data.artifact || {}
      });
    }
  }
});
