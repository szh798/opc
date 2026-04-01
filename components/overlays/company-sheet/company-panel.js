Component({
  options: {
    addGlobalClass: true
  },

  properties: {
    visible: {
      type: Boolean,
      value: false
    },
    cards: {
      type: Array,
      value: []
    }
  },

  methods: {
    handleMaskTap() {
      this.triggerEvent("close");
    },

    handleActionTap(event) {
      const { id, scene, action } = event.currentTarget.dataset;
      this.triggerEvent("actiontap", {
        id,
        scene,
        actionText: action || ""
      });
    }
  }
});
