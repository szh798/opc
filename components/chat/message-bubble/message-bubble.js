Component({
  options: {
    addGlobalClass: true
  },

  data: {
    singleLine: false,
    wide: false
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
      const singleLine = !compact && !hasLineBreak && compactLength > 0 && compactLength <= 14;
      const longestLineLength = source
        .split(/\r?\n/)
        .reduce((max, line) => Math.max(max, line.replace(/\s+/g, "").length), 0);
      const wide = variant === "agent" && !compact && hasLineBreak && longestLineLength >= 12;

      if (singleLine !== this.data.singleLine || wide !== this.data.wide) {
        this.setData({
          singleLine,
          wide
        });
      }
    }
  }
});
