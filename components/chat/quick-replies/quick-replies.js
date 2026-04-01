function normalizeItems(items = []) {
  return (items || []).map((entry) => {
    if (typeof entry === "string") {
      const label = entry.trim();
      return {
        label,
        action: label,
        isLong: label.length >= 10
      };
    }

    const label = String((entry && entry.label) || "").trim();
    return {
      ...entry,
      label,
      action: (entry && entry.action) || label,
      isLong: label.length >= 10
    };
  }).filter((entry) => entry.label);
}

Component({
  options: {
    addGlobalClass: true
  },

  data: {
    renderItems: []
  },

  properties: {
    items: {
      type: Array,
      value: []
    }
  },

  observers: {
    items(next) {
      this.setData({
        renderItems: normalizeItems(next)
      });
    }
  },

  lifetimes: {
    attached() {
      this.setData({
        renderItems: normalizeItems(this.data.items)
      });
    }
  },

  methods: {
    handleTap(event) {
      const { index } = event.currentTarget.dataset;
      const item = this.data.renderItems[index];

      this.triggerEvent("select", {
        item
      });
    }
  }
});
