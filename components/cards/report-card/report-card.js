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
    },
    primaryAction: {
      type: String,
      value: ""
    }
  },

  methods: {
    handlePrimary() {
      const stats = Array.isArray(this.data.stats) ? this.data.stats : [];
      const metrics = Array.isArray(this.data.metrics) ? this.data.metrics : [];

      this.triggerEvent("primary", {
        primaryAction: this.data.primaryAction,
        variant: this.data.variant,
        hasReportData: this.data.variant === "monthly" ? metrics.length > 0 : stats.length > 0
      });
    }
  }
});
