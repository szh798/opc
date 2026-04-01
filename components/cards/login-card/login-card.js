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
    userName: {
      type: String,
      value: ""
    },
    userAvatarUrl: {
      type: String,
      value: ""
    },
    userInitial: {
      type: String,
      value: "\u5c0f"
    }
  },

  methods: {
    handleTap() {
      if (this.properties.mode === "done") {
        return;
      }

      this.triggerEvent("action");
    },

    handleAgreementTap(event) {
      this.triggerEvent("agreementtap", {
        type: event.currentTarget.dataset.type || ""
      });
    }
  }
});
