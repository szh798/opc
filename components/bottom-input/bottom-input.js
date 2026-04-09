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
    },
    maxLength: {
      type: Number,
      value: 5000
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
    normalizeValue(value) {
      const maxLength = Number(this.properties.maxLength) || 5000;
      const text = String(value || "");
      if (maxLength > 0 && text.length > maxLength) {
        return text.slice(0, maxLength);
      }
      return text;
    },

    syncValue(value) {
      const safeValue = this.normalizeValue(value);
      this.setData({
        inputValue: safeValue,
        canSend: !!safeValue.trim()
      });
    },

    handlePlusTap() {
      this.triggerEvent("plustap");
    },

    handleInput(event) {
      const value = this.normalizeValue(event.detail && event.detail.value);

      this.setData({
        inputValue: value,
        canSend: !!value.trim()
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
