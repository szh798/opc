Component({
  options: {
    addGlobalClass: true
  },

  properties: {
    item: {
      type: Object,
      value: {}
    }
  },

  methods: {
    handleCtaTap() {
      const { item } = this.data;
      if (!item || !item.cta) {
        return;
      }

      this.triggerEvent("ctatap", {
        item
      });
    }
  }
});
