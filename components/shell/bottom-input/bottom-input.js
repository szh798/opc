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
      value: "\u8f93\u5165\u6d88\u606f..."
    }
  },

  data: {
    inputValue: "",
    canSend: false
  },

  lifetimes: {
    attached() {
      this.syncValue(this.properties.value);
    }
  },

  methods: {
    syncValue(value) {
      this.setData({
        inputValue: value || "",
        canSend: !!(value && String(value).trim())
      });
    },

    handlePlusTap() {
      this.triggerEvent("plustap");
    },

    handleInput(event) {
      const { value } = event.detail;

      this.setData({
        inputValue: value,
        canSend: !!(value && String(value).trim())
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
        inputValue: "",
        canSend: false
      });
    }
  }
});
