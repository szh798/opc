const POLICY_SOURCE_TYPES = {
  apply_entry: "申报入口",
  official_original: "官方原文",
  pdf: "PDF附件",
  interpretation: "政策解读",
  news: "解读/报道"
};

const POLICY_SOURCE_TYPE_ORDER = [
  "official_original",
  "pdf",
  "apply_entry",
  "interpretation",
  "news"
];

function sourceTypeLabel(type) {
  return POLICY_SOURCE_TYPES[type] || "来源";
}

function normalizeSourceUrlForKey(url) {
  const source = String(url || "")
    .replace(/&amp;/g, "&")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim();
  if (!source) return "";

  try {
    const parsed = new URL(source);
    parsed.protocol = parsed.protocol.toLowerCase();
    parsed.hostname = parsed.hostname.toLowerCase();
    parsed.hash = "";
    const nextParams = new URLSearchParams();
    Array.from(parsed.searchParams.entries())
      .filter(([key]) => {
        const normalizedKey = String(key || "").toLowerCase();
        return !normalizedKey.startsWith("utm_") && ![
          "from",
          "spm",
          "scene",
          "clicktime",
          "enterid",
          "fbclid",
          "gclid",
          "bd_vid"
        ].includes(normalizedKey);
      })
      .sort(([left], [right]) => String(left).localeCompare(String(right)))
      .forEach(([key, value]) => {
        nextParams.append(key, value);
      });
    parsed.search = nextParams.toString();
    const normalized = parsed.toString();
    return normalized.endsWith("/") ? normalized.slice(0, -1) : normalized;
  } catch (error) {
    return source.replace(/#.*$/, "").replace(/\/$/, "");
  }
}

function normalizePdfUrlForKey(url) {
  const source = String(url || "").trim();
  if (!source) return "";

  try {
    const parsed = new URL(source);
    const segments = parsed.pathname.split("/").filter(Boolean);
    const filename = String(segments[segments.length - 1] || "").trim().toLowerCase();
    if (filename.endsWith(".pdf")) {
      return `${parsed.hostname.toLowerCase()}:${filename}`;
    }
  } catch (error) {
    const filename = source.split(/[/?#]/).filter(Boolean).pop() || "";
    if (filename.toLowerCase().endsWith(".pdf")) {
      return filename.toLowerCase();
    }
  }

  return normalizeSourceUrlForKey(source);
}

function buildSourceDedupeKey(source) {
  const type = POLICY_SOURCE_TYPES[source.type] ? source.type : "news";
  const url = type === "pdf"
    ? normalizePdfUrlForKey(source.url)
    : normalizeSourceUrlForKey(source.url);
  return `${type}:${url}`;
}

function normalizeSources(item = {}) {
  const sources = Array.isArray(item.sources) ? item.sources : [];
  const fallback = [];
  const pushFallback = (type, label, value) => {
    const values = Array.isArray(value) ? value : value ? [value] : [];
    values.forEach((url) => {
      if (url) fallback.push({ type, label, url });
    });
  };
  pushFallback("official_original", "官方原文", item.primarySourceUrl || item.sourceUrl || (item.source && item.source.url));
  pushFallback("apply_entry", "申报入口", item.applyEntryUrl);
  pushFallback("pdf", "PDF附件", item.pdfUrls);

  const deduped = new Map();

  [...sources, ...fallback]
    .filter((source) => source && source.url)
    .forEach((source, index) => {
      const normalizedSource = {
        type: POLICY_SOURCE_TYPES[source.type] ? source.type : "news",
        label: source.label || sourceTypeLabel(source.type),
        url: String(source.url || "").trim(),
        note: source.note || "",
        sortOrder: Number.isFinite(Number(source.sortOrder)) ? Number(source.sortOrder) : index
      };
      const dedupeKey = buildSourceDedupeKey(normalizedSource);
      if (!dedupeKey || deduped.has(dedupeKey)) {
        return;
      }
      deduped.set(dedupeKey, normalizedSource);
    });

  return Array.from(deduped.values())
    .map((source) => ({
      type: source.type,
      label: source.label,
      url: source.url,
      note: source.note || "",
      sortOrder: source.sortOrder
    }))
    .sort((left, right) => {
      const typeOrder = POLICY_SOURCE_TYPE_ORDER.indexOf(left.type) - POLICY_SOURCE_TYPE_ORDER.indexOf(right.type);
      if (typeOrder !== 0) return typeOrder;
      return left.sortOrder - right.sortOrder;
    });
}

function groupSources(sources = []) {
  return POLICY_SOURCE_TYPE_ORDER
    .map((type) => ({
      type,
      title: sourceTypeLabel(type),
      items: dedupeSourceGroupItems(sources.filter((source) => source.type === type))
    }))
    .filter((group) => group.items.length);
}

function dedupeSourceGroupItems(items = []) {
  const seen = new Set();
  return items.filter((source) => {
    const key = normalizeSourceUrlForKey(source && source.url);
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function firstPolicyUrl(item = {}) {
  const sources = normalizeSources(item);
  return item.primaryActionUrl
    || (item.primarySource && item.primarySource.url)
    || (item.source && item.source.url)
    || (sources[0] && sources[0].url)
    || "";
}

function primaryActionText(item = {}) {
  const explicitText = normalizePrimaryActionText(item.primaryActionText);
  if (explicitText) return explicitText;
  const status = String(item.status || "");
  const sources = normalizeSources(item);
  const has = (type) => sources.some((source) => source.type === type);
  if (status === "open_apply" && has("apply_entry")) return "打开入口";
  if (status === "entry_pending") return has("official_original") ? "查看官网" : "关注进展";
  if (status === "trial_watch") return "查看试行稿";
  if (has("official_original")) return "查看官网";
  if (has("pdf")) return "复制PDF链接";
  if (has("interpretation")) return "看解读";
  if (has("news")) return "看报道";
  return "暂无官方来源";
}

function normalizePrimaryActionText(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (text === "看原文") return "查看官网";
  if (/^看\s*PDF$/i.test(text)) return "复制PDF链接";
  return text;
}

function statusText(item = {}) {
  if (item.statusText) return item.statusText;
  if (item.status === "open_apply") return "开放办理，需核验条件";
  if (item.status === "entry_pending") return "入口待公开";
  if (item.status === "trial_watch") return "试行跟踪";
  return "需人工核验";
}

function sourcesSummary(item = {}) {
  const groups = groupSources(normalizeSources(item));
  if (!groups.length && item.sourcesSummary) return item.sourcesSummary;
  if (!groups.length) return "暂无官方来源";
  return groups.map((group) => `${group.title}${group.items.length}个`).join(" · ");
}

function regionText(item = {}) {
  const region = item.region;
  if (typeof region === "string") return region;
  if (region && typeof region === "object") {
    return region.rawText || region.city || region.province || region.district || "";
  }
  return item.regionText || "";
}

function normalizeTagKey(value) {
  return String(value || "")
    .trim()
    .replace(/[\s，、。；;：:,.·\-_/（）()【】[\]{}"'“”‘’]/g, "")
    .toLowerCase();
}

function visibleTags(item = {}, resolvedRegionText = "") {
  const titleKey = normalizeTagKey(item.title);
  const seen = new Set();
  const candidates = [
    resolvedRegionText,
    ...(Array.isArray(item.fineTags) ? item.fineTags : [])
  ];
  const tags = [];

  candidates.forEach((value) => {
    const text = String(value || "").trim();
    const key = normalizeTagKey(text);
    if (!key || seen.has(key)) return;
    if (titleKey && titleKey.includes(key)) return;
    seen.add(key);
    tags.push(text);
  });

  return tags.slice(0, 5);
}

function decoratePolicyItem(item = {}) {
  const sources = normalizeSources(item);
  const sourceGroups = groupSources(sources);
  const primaryUrl = firstPolicyUrl({ ...item, sources });
  const resolvedRegionText = regionText(item) || "地区待核验";
  return {
    ...item,
    sources,
    sourceGroups,
    primaryActionText: primaryActionText({ ...item, sources }),
    primaryActionUrl: primaryUrl,
    regionText: resolvedRegionText,
    statusText: statusText(item),
    visibleTags: visibleTags(item, resolvedRegionText),
    sourcesSummary: sourcesSummary({ ...item, sources }),
    source: item.source || {
      name: sources[0] ? sources[0].label : "暂无官方来源",
      url: primaryUrl,
      domain: ""
    }
  };
}

module.exports = {
  POLICY_SOURCE_TYPES,
  POLICY_SOURCE_TYPE_ORDER,
  decoratePolicyItem,
  firstPolicyUrl,
  groupSources,
  normalizeSources,
  primaryActionText,
  regionText,
  sourceTypeLabel,
  sourcesSummary,
  statusText,
  visibleTags
};
