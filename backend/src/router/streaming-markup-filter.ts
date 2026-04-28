type SuppressMode = "tag" | "think" | "card" | "";

const TARGET_PREFIXES = ["<think", "</think", "<card", "</card", "<flow_"];

function findPartialTargetPrefix(value: string): boolean {
  return TARGET_PREFIXES.some((prefix) => prefix.startsWith(value) && value.length < prefix.length);
}

function resolveSuppressMode(value: string): SuppressMode | null {
  if (value.startsWith("<think")) return "think";
  if (value.startsWith("<card")) return "card";
  if (value.startsWith("</think") || value.startsWith("</card") || value.startsWith("<flow_")) return "tag";
  return null;
}

export class StreamingMarkupFilter {
  private buffer = "";
  private suppressMode: SuppressMode = "";

  consume(delta: string): string {
    this.buffer += String(delta || "");
    let visible = "";

    while (this.buffer) {
      if (this.suppressMode) {
        if (this.suppressMode === "tag") {
          const end = this.buffer.indexOf(">");
          if (end === -1) {
            this.buffer = "";
            break;
          }
          this.buffer = this.buffer.slice(end + 1);
          this.suppressMode = "";
          continue;
        }

        const closing = this.suppressMode === "think" ? "</think" : "</card";
        const lower = this.buffer.toLowerCase();
        const closingIndex = lower.indexOf(closing);
        if (closingIndex === -1) {
          this.buffer = "";
          break;
        }
        const closeEnd = this.buffer.indexOf(">", closingIndex);
        if (closeEnd === -1) {
          this.buffer = this.buffer.slice(closingIndex);
          break;
        }
        this.buffer = this.buffer.slice(closeEnd + 1);
        this.suppressMode = "";
        continue;
      }

      const tagStart = this.buffer.indexOf("<");
      if (tagStart === -1) {
        visible += this.buffer;
        this.buffer = "";
        break;
      }

      if (tagStart > 0) {
        visible += this.buffer.slice(0, tagStart);
        this.buffer = this.buffer.slice(tagStart);
      }

      const lower = this.buffer.toLowerCase();
      if (findPartialTargetPrefix(lower)) {
        break;
      }

      const mode = resolveSuppressMode(lower);
      if (mode) {
        this.suppressMode = mode;
        continue;
      }

      visible += this.buffer[0];
      this.buffer = this.buffer.slice(1);
    }

    return visible;
  }

  flush(): string {
    if (this.suppressMode) {
      this.buffer = "";
      this.suppressMode = "";
      return "";
    }
    const lower = this.buffer.toLowerCase();
    if (lower && findPartialTargetPrefix(lower)) {
      this.buffer = "";
      return "";
    }
    const visible = this.buffer;
    this.buffer = "";
    return visible;
  }
}
