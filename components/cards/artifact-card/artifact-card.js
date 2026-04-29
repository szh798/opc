Component({
  options: {
    addGlobalClass: true
  },

  properties: {
    title: {
      type: String,
      value: ""
    },
    description: {
      type: String,
      value: ""
    },
    tags: {
      type: Array,
      value: []
    },
    meta: {
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
    primaryAction: {
      type: String,
      value: ""
    },
    secondaryAction: {
      type: String,
      value: ""
    },
    cardType: {
      type: String,
      value: ""
    },
    cardStyle: {
      type: String,
      value: "default"
    }
  },

  methods: {
    handlePrimary() {
      this.triggerEvent("primary", {
        action: this.data.primaryAction,
        cardType: this.data.cardType
      });
    },

    handleSecondary() {
      this.triggerEvent("secondary", {
        action: this.data.secondaryAction,
        primaryAction: this.data.primaryAction,
        cardType: this.data.cardType
      });
    }
  }
});
