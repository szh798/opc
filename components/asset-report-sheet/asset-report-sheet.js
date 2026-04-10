Component({
  properties: {
    visible: {
      type: Boolean,
      value: false
    },
    mode: {
      type: String,
      value: "view" // 'view' or 'update'
    },
    profile: {
      type: Object,
      value: {}
    }
  },

  methods: {
    handleMaskTap() {
      this.triggerEvent("close");
    },
    handleReject() {
      this.triggerEvent("reject");
    },
    handleAccept() {
      this.triggerEvent("accept");
    }
  }
});
