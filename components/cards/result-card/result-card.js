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
    handleCardTap() {
      const { item } = this.data;
      if (!item || !item.id) {
        return;
      }

      this.triggerEvent("detailtap", {
        item
      });
    },

    handleCtaTap() {
      const { item } = this.data;
      if (!item || !item.cta) {
        return;
      }

      this.triggerEvent("ctatap", {
        item
      });
    },

    handleShareTap() {
      const { item } = this.data;
      if (!item || !item.id) {
        return;
      }

      this.triggerEvent("sharetap", {
        item
      });
    }
  }
});
