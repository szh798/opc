Component({
  options: {
    addGlobalClass: true
  },

  properties: {
    visible: {
      type: Boolean,
      value: false
    },
    type: {
      type: String,
      value: "loading"
    },
    title: {
      type: String,
      value: ""
    },
    desc: {
      type: String,
      value: ""
    },
    actionText: {
      type: String,
      value: ""
    },
    mode: {
      type: String,
      value: "block"
    }
  },

  methods: {
    handleActionTap() {
      this.triggerEvent("action");
    }
  }
});
