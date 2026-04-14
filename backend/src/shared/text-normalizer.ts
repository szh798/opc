const KNOWN_MOJIBAKE_REPLACEMENTS: Array<[RegExp, string]> = [
  [/璺敱浼氳瘽-/g, "路由会话-"],
  [/璺敱娴佷笉瀛樺湪/g, "路由流不存在"],
  [/璺敱浼氳瘽涓嶅瓨鍦\?\s*/g, "路由会话不存在: "],
  [/璺敱浼氳瘽涓嶅瓨鍦/g, "路由会话不存在"]
];

const LIKELY_MOJIBAKE_RE = /(璺敱|浼氳瘽|娴佷笉瀛樺湪|�)/;

export function hasLikelyMojibake(text: string) {
  return LIKELY_MOJIBAKE_RE.test(String(text || ""));
}

export function normalizeKnownMojibake(text: string) {
  let normalized = String(text || "");
  for (const [pattern, replacement] of KNOWN_MOJIBAKE_REPLACEMENTS) {
    normalized = normalized.replace(pattern, replacement);
  }
  return normalized;
}

export function buildRouterConversationLabel(agentKey: string) {
  return `路由会话-${String(agentKey || "").trim() || "master"}`;
}

export function truncateByCodePoints(text: string, max = 12) {
  const value = String(text || "");
  const limit = Math.max(0, Number(max) || 0);
  if (!limit) return "";
  return Array.from(value).slice(0, limit).join("");
}

export function buildConversationLabelFromText(text: string, date = new Date()) {
  const dateLabel = new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric"
  }).format(date);
  const snippet = truncateByCodePoints(String(text || "").trim(), 12);
  return `${dateLabel} ${snippet || "新对话"}`;
}
