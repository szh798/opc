Component({
  options: {
    addGlobalClass: true
  },

  properties: {
    visible: {
      type: Boolean,
      value: false
    },
    projects: {
      type: Array,
      value: []
    }
  },

  methods: {
    handleMaskTap() {
      this.triggerEvent("close");
    },

    handleProjectTap(event) {
      this.triggerEvent("projecttap", {
        id: event.currentTarget.dataset.id
      });
    },

    handleCreateTap() {
      this.triggerEvent("create");
    }
  }
});
