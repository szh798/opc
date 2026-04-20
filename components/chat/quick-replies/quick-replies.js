const LONG_REPLY_THRESHOLD = 12;

function isLongReply(label) {
  return label.length > LONG_REPLY_THRESHOLD;
}

function normalizeItems(items = []) {
  return (items || []).map((entry) => {
    if (typeof entry === "string") {
      const label = entry.trim();
      return {
        label,
        action: label,
        isLong: isLongReply(label)
      };
    }

    const label = String((entry && entry.label) || "").trim();
    return {
      ...entry,
      label,
      action: (entry && entry.action) || label,
      isLong: isLongReply(label)
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
