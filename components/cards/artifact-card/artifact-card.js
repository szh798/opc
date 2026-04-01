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
    cardStyle: {
      type: String,
      value: "default"
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
