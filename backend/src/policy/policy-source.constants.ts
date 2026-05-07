import { createHash } from "node:crypto";

export const POLICY_SOURCE_TYPES = {
  official_original: "官方原文",
  pdf: "PDF附件",
  apply_entry: "申报入口",
  interpretation: "政策解读",
  news: "解读/报道"
} as const;

export type PolicySourceType = keyof typeof POLICY_SOURCE_TYPES;

export const POLICY_SOURCE_TYPE_ORDER: PolicySourceType[] = [
  "apply_entry",
  "official_original",
  "pdf",
  "interpretation",
  "news"
];

export type NormalizedPolicySource = {
  sourceKey: string;
  type: PolicySourceType;
  label: string;
  url: string;
  note?: string;
  sortOrder: number;
};

export type LegacyPolicySource = {
  name: string;
  url: string;
  domain: string;
};

export type PrimaryPolicySourceChoice = {
  primarySource: NormalizedPolicySource | null;
  primarySourceUrl: string;
  primaryActionText: string;
  primaryActionUrl: string;
};

const TRACKING_PARAMS = new Set([
  "from",
  "spm",
  "scene",
  "clicktime",
  "enterid",
  "fbclid",
  "gclid",
  "bd_vid"
]);

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function isPolicySourceType(value: unknown): value is PolicySourceType {
  return Object.prototype.hasOwnProperty.call(POLICY_SOURCE_TYPES, String(value || ""));
}

export function normalizePolicySourceType(value: unknown): PolicySourceType | null {
  const source = readString(value);
  return isPolicySourceType(source) ? source : null;
}

export function getPolicySourceTypeLabel(type: unknown) {
  const safeType = normalizePolicySourceType(type);
  return safeType ? POLICY_SOURCE_TYPES[safeType] : "";
}

export function normalizePolicyUrl(value: unknown): string | null {
  const raw = readString(value);
  if (!raw) {
    return null;
  }

  try {
    const parsed = new URL(raw);
    if (!/^https?:$/i.test(parsed.protocol)) {
      return null;
    }

    parsed.hash = "";
    const nextParams = new URLSearchParams();
    const sortedEntries = Array.from(parsed.searchParams.entries())
      .filter(([key]) => {
        const normalizedKey = key.toLowerCase();
        return !normalizedKey.startsWith("utm_") && !TRACKING_PARAMS.has(normalizedKey);
      })
      .sort(([left], [right]) => left.localeCompare(right));

    for (const [key, paramValue] of sortedEntries) {
      nextParams.append(key, paramValue);
    }

    parsed.search = nextParams.toString();
    let normalized = parsed.toString();
    if (normalized.endsWith("/")) {
      normalized = normalized.slice(0, -1);
    }
    return normalized;
  } catch {
    return null;
  }
}

export function buildPolicySourceKey(type: PolicySourceType, url: string) {
  return createHash("sha1").update(`${type}:${url}`).digest("hex").slice(0, 16);
}

export function getDomainFromUrl(value: unknown) {
  const normalized = normalizePolicyUrl(value);
  if (!normalized) {
    return "";
  }
  try {
    return new URL(normalized).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

export function getPolicySourceTypeOrder(type: unknown) {
  const safeType = normalizePolicySourceType(type);
  const index = safeType ? POLICY_SOURCE_TYPE_ORDER.indexOf(safeType) : -1;
  return index >= 0 ? index : POLICY_SOURCE_TYPE_ORDER.length;
}

export function sortPolicySources<T extends { type: string; sortOrder?: number; url?: string }>(sources: T[]): T[] {
  return [...sources].sort((left, right) => {
    const typeOrder = getPolicySourceTypeOrder(left.type) - getPolicySourceTypeOrder(right.type);
    if (typeOrder !== 0) {
      return typeOrder;
    }
    const sortOrder = Number(left.sortOrder || 0) - Number(right.sortOrder || 0);
    if (sortOrder !== 0) {
      return sortOrder;
    }
    return String(left.url || "").localeCompare(String(right.url || ""));
  });
}

export function normalizePolicySourcesFromRecord(record: Record<string, unknown>): {
  sources: NormalizedPolicySource[];
  warnings: string[];
} {
  const warnings: string[] = [];
  const rawSources = Array.isArray(record.sources) ? record.sources : [];
  const candidates: Array<Record<string, unknown>> = rawSources.filter(isRecord);

  const pushFallback = (type: PolicySourceType, label: string, value: unknown) => {
    const values = Array.isArray(value) ? value : value ? [value] : [];
    for (const item of values) {
      candidates.push({ type, label, url: item });
    }
  };

  pushFallback("official_original", "官方原文", record.sourceUrl || record.primarySourceUrl);
  pushFallback("apply_entry", "申报入口", record.applyEntryUrl);
  pushFallback("pdf", "PDF附件", record.pdfUrls);

  const deduped = new Map<string, NormalizedPolicySource>();
  candidates.forEach((candidate, index) => {
    const type = normalizePolicySourceType(candidate.type);
    if (!type) {
      warnings.push(`invalid source type at index ${index}: ${String(candidate.type || "")}`);
      return;
    }

    const url = normalizePolicyUrl(candidate.url);
    if (!url) {
      warnings.push(`invalid source url at index ${index}: ${String(candidate.url || "")}`);
      return;
    }

    const sourceKey = buildPolicySourceKey(type, url);
    if (deduped.has(sourceKey)) {
      return;
    }

    deduped.set(sourceKey, {
      sourceKey,
      type,
      label: readString(candidate.label) || POLICY_SOURCE_TYPES[type],
      url,
      note: readString(candidate.note) || undefined,
      sortOrder: Number.isFinite(Number(candidate.sortOrder)) ? Number(candidate.sortOrder) : index
    });
  });

  return {
    sources: sortPolicySources(Array.from(deduped.values())),
    warnings
  };
}

export function choosePrimaryPolicySource(
  status: string,
  inputSources: Array<NormalizedPolicySource | null | undefined>
): PrimaryPolicySourceChoice {
  const sources = sortPolicySources(inputSources.filter(Boolean) as NormalizedPolicySource[]);
  const byType = (type: PolicySourceType) => sources.find((source) => source.type === type) || null;
  const normalizedStatus = String(status || "").trim();
  const applyEntry = byType("apply_entry");
  const official = byType("official_original");
  const pdf = byType("pdf");
  const interpretation = byType("interpretation");
  const news = byType("news");

  if (normalizedStatus === "open_apply" && applyEntry) {
    return buildPrimaryChoice(applyEntry, "打开入口");
  }
  if (normalizedStatus === "entry_pending") {
    return buildPrimaryChoice(official || applyEntry || pdf || interpretation || news || sources[0] || null, official ? "看原文" : "关注进展");
  }
  if (normalizedStatus === "trial_watch") {
    return buildPrimaryChoice(official || pdf || interpretation || news || applyEntry || sources[0] || null, official ? "查看试行稿" : "看原文");
  }
  if (official) {
    return buildPrimaryChoice(official, "看原文");
  }
  if (pdf) {
    return buildPrimaryChoice(pdf, "看 PDF");
  }
  if (interpretation) {
    return buildPrimaryChoice(interpretation, "看解读");
  }
  if (news) {
    return buildPrimaryChoice(news, "看报道");
  }
  return buildPrimaryChoice(sources[0] || null, sources[0] ? "复制来源" : "暂无官方来源");
}

function buildPrimaryChoice(source: NormalizedPolicySource | null, primaryActionText: string): PrimaryPolicySourceChoice {
  const url = source?.url || "";
  return {
    primarySource: source,
    primarySourceUrl: url,
    primaryActionText,
    primaryActionUrl: url
  };
}

export function buildLegacyPolicySource(source: NormalizedPolicySource | null | undefined): LegacyPolicySource {
  const url = source?.url || "";
  return {
    name: source ? source.label || POLICY_SOURCE_TYPES[source.type] : "暂无官方来源",
    url,
    domain: getDomainFromUrl(url)
  };
}

export function buildSourcesSummary(inputSources: Array<{ type: string } | null | undefined>) {
  const sources = inputSources.filter(Boolean) as Array<{ type: string }>;
  if (!sources.length) {
    return "暂无官方来源";
  }

  const counts = new Map<PolicySourceType, number>();
  for (const source of sources) {
    const type = normalizePolicySourceType(source.type);
    if (!type) {
      continue;
    }
    counts.set(type, (counts.get(type) || 0) + 1);
  }

  return POLICY_SOURCE_TYPE_ORDER
    .filter((type) => counts.has(type))
    .map((type) => `${POLICY_SOURCE_TYPES[type]}${counts.get(type)}个`)
    .join(" · ") || "暂无官方来源";
}

export function buildPolicyStatusText(status: unknown) {
  const normalizedStatus = readString(status);
  if (normalizedStatus === "open_apply") return "开放办理，需核验条件";
  if (normalizedStatus === "entry_pending") return "入口待公开";
  if (normalizedStatus === "trial_watch") return "试行跟踪";
  if (normalizedStatus === "closed" || normalizedStatus === "expired") return "已结束";
  return "需人工核验";
}

export function buildPolicySourceGroups<T extends { type: string }>(sources: T[]): Record<PolicySourceType, T[]> {
  return POLICY_SOURCE_TYPE_ORDER.reduce<Record<PolicySourceType, T[]>>((acc, type) => {
    acc[type] = sources.filter((source) => source.type === type);
    return acc;
  }, {
    apply_entry: [],
    official_original: [],
    pdf: [],
    interpretation: [],
    news: []
  });
}

export function buildPolicyCandidatesJson(items: Array<Record<string, unknown>>) {
  return items.map((item) => ({
    policy_id: item.policyId || item.id,
    region: item.region,
    title: item.title,
    status: item.status,
    statusText: item.statusText,
    fine_tags: item.fineTags || item.fine_tags || [],
    sources: item.sources || [],
    matchReason: item.matchReason || item.opcRelevanceReason || "",
    nextAction: item.nextAction || item.primaryActionText || ""
  }));
}

export function validateDifyPolicyReferences(
  candidates: Array<{ policy_id?: unknown; sources?: unknown }>,
  output: { policy_id?: unknown; url?: unknown }
) {
  const policyId = readString(output.policy_id);
  const url = normalizePolicyUrl(output.url);
  const candidate = candidates.find((item) => readString(item.policy_id) === policyId);
  if (!candidate) {
    return { ok: false, reason: "policy_id_not_in_candidates" };
  }
  if (!url) {
    return { ok: true, reason: "no_url_to_validate" };
  }
  const sourceUrls = Array.isArray(candidate.sources)
    ? candidate.sources
        .filter(isRecord)
        .map((source) => normalizePolicyUrl(source.url))
        .filter(Boolean)
    : [];
  return sourceUrls.includes(url)
    ? { ok: true, reason: "matched_candidate_source" }
    : { ok: false, reason: "url_not_in_candidate_sources" };
}
