Component({
  options: {
    addGlobalClass: true
  },

  properties: {
    visible: {
      type: Boolean,
      value: false
    },
    skills: {
      type: Array,
      value: []
    }
  },

  methods: {
    handleCloseTap() {
      this.triggerEvent("close");
    },

    handleSkillTap(event) {
      this.triggerEvent("select", {
        key: event.currentTarget.dataset.key
      });
    }
  }
});
