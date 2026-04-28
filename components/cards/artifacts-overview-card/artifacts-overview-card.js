Component({
  options: {
    addGlobalClass: true
  },

  properties: {
    overview: {
      type: Object,
      value: {}
    }
  },

  methods: {
    handleCtaTap() {
      this.triggerEvent("ctatap", {
        overview: this.data.overview || {}
      });
    }
  }
});
