const { decoratePolicyItem, firstPolicyUrl } = require("../../../services/policy-source.constants");

Component({
  options: {
    addGlobalClass: true
  },

  data: {
    displayItems: []
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

  observers: {
    payload(payload) {
      this.setData({
        displayItems: normalizePayloadItems(payload)
      });
    }
  },

  methods: {
    handleAction(event) {
      const dataset = event.currentTarget.dataset || {};
      const item = dataset.item || null;
      this.triggerEvent("action", {
        action: dataset.action || "",
        url: dataset.url || (item ? firstPolicyUrl(item) : ""),
        item,
        payload: this.properties.payload || {}
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
      const items = this.data.displayItems || [];
      return items[0] || null;
    },

    firstUrl() {
      const item = this.firstItem();
      return item ? firstPolicyUrl(item) : "";
    }
  }
});

function normalizePayloadItems(payload) {
  const items = payload && Array.isArray(payload.items) ? payload.items : [];
  return items.map((item) => decoratePolicyItem(item || {}));
}
