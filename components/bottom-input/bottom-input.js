Component({
  options: {
    addGlobalClass: true
  },

  properties: {
    value: {
      type: String,
      value: "",
      observer: "syncValue"
    },
    placeholder: {
      type: String,
      value: "输入消息..."
    }
  },

  data: {
    inputValue: ""
  },

  lifetimes: {
    attached() {
      this.syncValue(this.properties.value);
    }
  },

  methods: {
    syncValue(value) {
      this.setData({
        inputValue: value || ""
      });
    },

    handlePlusTap() {
      this.triggerEvent("plustap");
    },

    handleInput(event) {
      const { value } = event.detail;

      this.setData({
        inputValue: value
      });

      this.triggerEvent("inputchange", {
        value
      });
    },

    handleSend() {
      const value = (this.data.inputValue || "").trim();

      if (!value) {
        return;
      }

      this.triggerEvent("send", {
        value
      });

      this.setData({
        inputValue: ""
      });
    }
  }
});
