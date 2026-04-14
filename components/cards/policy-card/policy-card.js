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
    cardType: {
      type: String,
      value: "policy_opportunity"
    },
    payload: {
      type: Object,
      value: {}
    },
    actions: {
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
    },
    primaryAction: {
      type: String,
      value: ""
    },
    secondaryAction: {
      type: String,
      value: ""
    }
  },

  methods: {
    handleAction(event) {
      const dataset = event.currentTarget.dataset || {};
      this.triggerEvent("action", {
        action: dataset.action || "",
        url: dataset.url || "",
        item: dataset.item || null
      });
    },

    handlePrimary() {
      this.triggerEvent("action", {
        action: this.properties.primaryAction || "ask_agent_explain",
        item: this.firstItem()
      });
    },

    handleSecondary() {
      this.triggerEvent("action", {
        action: this.properties.secondaryAction || "copy_link",
        item: this.firstItem(),
        url: this.firstUrl()
      });
    },

    firstItem() {
      const items = this.properties.payload && Array.isArray(this.properties.payload.items)
        ? this.properties.payload.items
        : [];
      return items[0] || null;
    },

    firstUrl() {
      const item = this.firstItem();
      return item && item.source ? item.source.url || "" : "";
    }
  }
});
