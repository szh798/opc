Component({
  options: {
    addGlobalClass: true
  },

  properties: {
    title: {
      type: String,
      value: ""
    },
    unlocked: {
      type: String,
      value: ""
    },
    copy: {
      type: String,
      value: ""
    },
    primaryText: {
      type: String,
      value: ""
    },
    secondaryText: {
      type: String,
      value: ""
    },
    tone: {
      type: String,
      value: "success"
    }
  },

  methods: {
    handlePrimary() {
      this.triggerEvent("primary");
    },

    handleSecondary() {
      this.triggerEvent("secondary");
    }
  }
});
