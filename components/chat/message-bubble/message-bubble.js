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
    compact: {
      type: Boolean,
      value: false
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
    "text, variant, compact": function watchText(text, variant, compact) {
      const source = String(text || "");
      const hasLineBreak = /\r|\n/.test(source);
      const compactLength = source.replace(/\s+/g, "").length;
      const singleLine = !compact && variant === "user" && !hasLineBreak && compactLength > 0 && compactLength <= 14;

      if (singleLine !== this.data.singleLine) {
        this.setData({
          singleLine
        });
      }
    }
  }
});
