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
    },
    maxLength: {
      type: Number,
      value: 5000
    },
    streaming: {
      type: Boolean,
      value: false
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
      // 流式输出期间发送键被替换成停止键,避免用户在 Dify 还没说完时又塞一条进去。
      if (this.properties.streaming) {
        return;
      }

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
    },

    handleStop() {
      this.triggerEvent("stop");
    }
  }
});
