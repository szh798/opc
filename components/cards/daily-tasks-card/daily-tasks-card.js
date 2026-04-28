Component({
  options: {
    addGlobalClass: true
  },

  properties: {
    title: {
      type: String,
      value: "一树帮你推动"
    },
    items: {
      type: Array,
      value: []
    }
  },

  methods: {
    emitAction(event) {
      const dataset = event.currentTarget.dataset || {};
      const item = this.data.items[Number(dataset.index)] || {};
      this.triggerEvent("taskaction", {
        taskId: item.id || "",
        actionKey: dataset.action || "",
        actionLabel: dataset.label || "",
        value: dataset.value || "",
        item
      });
    }
  }
});
