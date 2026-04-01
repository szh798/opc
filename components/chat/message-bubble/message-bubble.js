Component({
  options: {
    addGlobalClass: true
  },

  data: {
    singleLine: false
  },

  properties: {
    variant: {
      type: String,
      value: "agent"
    },
    text: {
      type: String,
      value: ""
    },
    borderColor: {
      type: String,
      value: ""
    }
  },

  observers: {
    "text, variant": function watchText(text, variant) {
      const source = String(text || "");
      const hasLineBreak = /\r|\n/.test(source);
      const compactLength = source.replace(/\s+/g, "").length;
      const singleLine = variant === "user" && !hasLineBreak && compactLength > 0 && compactLength <= 8;

      if (singleLine !== this.data.singleLine) {
        this.setData({
          singleLine
        });
      }
    }
  }
});
