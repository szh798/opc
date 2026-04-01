Component({
  options: {
    addGlobalClass: true
  },

  properties: {
    paragraphs: {
      type: Array,
      value: []
    },
    primaryText: {
      type: String,
      value: ""
    },
    secondaryText: {
      type: String,
      value: ""
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
