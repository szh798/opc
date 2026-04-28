const DEFAULT_STEPS = [
  {
    key: "collect_facts",
    label: "\u6574\u7406\u4f60\u7684\u7ecf\u5386\u548c\u6280\u80fd",
    status: "pending",
    description: "\u63d0\u53d6\u6709\u6548\u4fe1\u606f\uff0c\u8fc7\u6ee4\u95f2\u804a\u548c\u91cd\u590d\u63cf\u8ff0\u3002"
  },
  {
    key: "classify_assets",
    label: "\u5f52\u7c7b\u5230\u56db\u7c7b\u8d44\u4ea7",
    status: "pending",
    description: "\u80fd\u529b\u3001\u8d44\u6e90\u3001\u8ba4\u77e5\u3001\u5173\u7cfb\u4f1a\u88ab\u521d\u6b65\u5f52\u7c7b\u3002"
  },
  {
    key: "score_radar",
    label: "\u8ba1\u7b97\u8d44\u4ea7\u96f7\u8fbe\u56fe",
    status: "pending",
    description: "\u5224\u65ad\u54ea\u4e9b\u4f18\u52bf\u771f\u7684\u80fd\u53d8\u6210\u5546\u4e1a\u65b9\u5411\u3002"
  },
  {
    key: "write_summary",
    label: "\u63d0\u70bc\u9690\u85cf\u4f18\u52bf",
    status: "pending",
    description: "\u8f93\u51fa\u4e00\u6bb5\u4e0d\u5e9f\u8bdd\u7684\u4f18\u52bf\u603b\u7ed3\u3002"
  }
];

function clampProgress(value) {
  const next = Number(value);
  if (!Number.isFinite(next)) return 0;
  return Math.max(0, Math.min(100, Math.round(next)));
}

function normalizeLevel(level, score) {
  const raw = String(level || "").toLowerCase();
  if (raw === "high") return "\u9ad8";
  if (raw === "medium") return "\u4e2d";
  if (raw === "low") return "\u4f4e";
  return Number(score) >= 70 ? "\u9ad8" : Number(score) >= 48 ? "\u4e2d" : "\u4f4e";
}

function statusText(status) {
  if (status === "done") return "\u5b8c\u6210";
  if (status === "running") return "\u8fdb\u884c\u4e2d";
  if (status === "failed") return "\u5931\u8d25";
  return "\u7b49\u5f85\u4e2d";
}

function normalizePayload(payload = {}) {
  const source = payload && typeof payload === "object" ? payload : {};
  const progress = clampProgress(source.progress);
  const steps = Array.isArray(source.steps) && source.steps.length ? source.steps : DEFAULT_STEPS;
  const radar = Array.isArray(source.radar_preview) ? source.radar_preview : [];
  return {
    title: source.title || "\u6211\u6b63\u5728\u76d8\u4f60\u7684\u5e95\u724c",
    subtitle: source.subtitle || "\u4e0d\u662f\u7b80\u5355\u603b\u7ed3\u804a\u5929\u8bb0\u5f55\uff0c\u800c\u662f\u628a\u4f60\u7684\u7ecf\u5386\u3001\u6280\u80fd\u3001\u8d44\u6e90\u548c\u8ba4\u77e5\u62c6\u5f00\u770b\u3002",
    status: source.status || "running",
    progress,
    progressStyle: `width: ${progress}%`,
    foundAssets: Array.isArray(source.found_assets) ? source.found_assets : [],
    steps: steps.map((step) => ({
      key: step.key || "",
      label: step.label || "",
      status: step.status || "pending",
      statusText: statusText(step.status),
      description: step.description || ""
    })),
    radarPreview: radar.map((item) => {
      const score = clampProgress(item.score);
      return {
        name: item.name || "",
        score,
        widthStyle: `width: ${score}%`,
        levelText: normalizeLevel(item.level, score)
      };
    }),
    radarPreviewIsFinal: source.radar_preview_is_final === true
  };
}

Component({
  properties: {
    cardId: {
      type: String,
      value: ""
    },
    cardData: {
      type: Object,
      value: {}
    }
  },
  data: {
    viewData: normalizePayload({})
  },
  observers: {
    cardData(next) {
      this.setData({
        viewData: normalizePayload(next)
      });
    }
  }
});
