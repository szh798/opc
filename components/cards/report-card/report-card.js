Component({
  options: {
    addGlobalClass: true
  },

  properties: {
    variant: {
      type: String,
      value: "weekly"
    },
    title: {
      type: String,
      value: ""
    },
    stats: {
      type: Array,
      value: []
    },
    metrics: {
      type: Array,
      value: []
    },
    comment: {
      type: String,
      value: ""
    },
    comparison: {
      type: String,
      value: ""
    },
    advice: {
      type: String,
      value: ""
    },
    primaryText: {
      type: String,
      value: ""
    }
  },

  methods: {
    handlePrimary() {
      this.triggerEvent("primary");
    }
  }
});
