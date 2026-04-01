Component({
  options: {
    addGlobalClass: true
  },

  properties: {
    headline: {
      type: String,
      value: ""
    },
    proofTitle: {
      type: String,
      value: "同路人数据"
    },
    proof: {
      type: String,
      value: ""
    },
    proofStats: {
      type: Array,
      value: []
    },
    nudge: {
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
