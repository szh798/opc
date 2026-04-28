Component({
  options: {
    addGlobalClass: true
  },

  properties: {
    item: {
      type: Object,
      value: {}
    }
  },

  methods: {
    emitAction(action) {
      const item = this.data.item || {};
      this.triggerEvent("artifactaction", {
        action,
        item
      });
    },

    handleView() {
      this.emitAction("view");
    },

    handleContinue() {
      this.emitAction("continue");
    },

    handleShare() {
      this.emitAction("share");
    },

    handleConfirm() {
      this.emitAction("confirm");
    }
  }
});
