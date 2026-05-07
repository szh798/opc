import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../shared/prisma.service";
import {
  buildLegacyPolicySource,
  buildPolicyStatusText,
  buildSourcesSummary,
  choosePrimaryPolicySource,
  getDomainFromUrl,
  normalizePolicySourceType,
  normalizePolicySourcesFromRecord,
  normalizePolicyUrl,
  sortPolicySources
} from "./policy-source.constants";
import type { PolicyCatalogItem, PolicyCollectedSlots, PolicySource } from "./policy.types";

type PolicySourceRow = {
  id: string;
  policyId: string;
  sourceKey: string;
  type: string;
  label: string;
  url: string;
  note: string | null;
  sortOrder: number;
};

type PolicyItemRow = {
  id: string;
  region: string;
  province: string | null;
  city: string | null;
  district: string | null;
  title: string;
  summary: string | null;
  status: string;
  fineTags: string[];
  sourceDate: Date | null;
  lastVerifiedAt: Date | null;
  isActive: boolean;
  priority: number;
  metadata: unknown;
  sources: PolicySourceRow[];
};

@Injectable()
export class PolicyCatalogService {
  private readonly logger = new Logger(PolicyCatalogService.name);

  constructor(private readonly prisma: PrismaService) {}

  async listPolicies(input: { activeOnly?: boolean; region?: string; limit?: number } = {}) {
    try {
      const rows = await this.prisma.policyItem.findMany({
        where: {
          ...(input.activeOnly === false ? {} : { isActive: true }),
          ...(input.region ? { region: { contains: input.region } } : {})
        },
        include: {
          sources: true
        },
        orderBy: [
          { priority: "desc" },
          { updatedAt: "desc" }
        ],
        take: Math.max(1, Math.min(100, Number(input.limit || 50)))
      });

      return rows.map((row) => this.toCatalogItem(row as PolicyItemRow)).filter(Boolean) as PolicyCatalogItem[];
    } catch (error) {
      this.logger.warn(`policy catalog list failed: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  }

  async getPolicy(id: string) {
    const safeId = String(id || "").trim();
    if (!safeId) {
      return null;
    }

    try {
      const row = await this.prisma.policyItem.findUnique({
        where: { id: safeId },
        include: { sources: true }
      });

      return row ? this.toCatalogItem(row as PolicyItemRow) : null;
    } catch (error) {
      this.logger.warn(`policy catalog get failed: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  async findCandidatePolicies(slots: PolicyCollectedSlots, input: { limit?: number } = {}) {
    const policies = await this.listPolicies({
      activeOnly: true,
      limit: Math.max(20, Number(input.limit || 10) * 4)
    });

    const ranked = policies
      .map((policy) => ({
        policy,
        score: scoreCatalogPolicy(policy, slots),
        regionFit: getCatalogRegionFit(policy, slots)
      }))
      .filter((item) => item.score > 0);
    const hasRequestedRegion = hasCatalogRequestedRegion(slots);
    const localMatches = ranked.filter((item) => item.regionFit === "local");
    const nationalMatches = ranked.filter((item) => item.regionFit === "national");
    const candidates = hasRequestedRegion
      ? localMatches.length
        ? localMatches
        : nationalMatches
      : ranked;

    return candidates
      .sort((left, right) => right.score - left.score)
      .slice(0, Math.max(1, Number(input.limit || 10)))
      .map((item) => item.policy);
  }

  toCatalogItem(row: PolicyItemRow): PolicyCatalogItem | null {
    const sources = sortPolicySources(
      (row.sources || [])
        .map((source): PolicySource | null => {
          const type = normalizePolicySourceType(source.type);
          const url = normalizePolicyUrl(source.url);
          if (!type || !url) {
            return null;
          }
          return {
            id: source.id,
            policyId: source.policyId,
            sourceKey: source.sourceKey,
            type,
            label: source.label,
            url,
            note: source.note || undefined,
            sortOrder: source.sortOrder
          };
        })
        .filter(Boolean) as PolicySource[]
    );

    const primary = choosePrimaryPolicySource(row.status, sources);
    const source = buildLegacyPolicySource(primary.primarySource);
    const metadata = isRecord(row.metadata) ? row.metadata : {};

    return {
      id: row.id,
      policyId: row.id,
      region: row.region,
      province: row.province,
      city: row.city,
      district: row.district,
      title: row.title,
      summary: row.summary,
      status: row.status,
      statusText: buildPolicyStatusText(row.status),
      fineTags: Array.isArray(row.fineTags) ? row.fineTags : [],
      sourceDate: formatIsoDate(row.sourceDate),
      lastVerifiedAt: row.lastVerifiedAt ? row.lastVerifiedAt.toISOString() : null,
      sources,
      primarySource: primary.primarySource,
      source,
      primarySourceUrl: primary.primarySourceUrl,
      applyEntryUrl: sources.find((item) => item.type === "apply_entry")?.url || "",
      pdfUrls: sources.filter((item) => item.type === "pdf").map((item) => item.url),
      sourcesSummary: buildSourcesSummary(sources),
      primaryActionText: primary.primaryActionText,
      primaryActionUrl: primary.primaryActionUrl,
      priority: row.priority,
      metadata
    };
  }
}

export function normalizeSeedPolicyRecord(record: Record<string, unknown>, fallbackSourceDate = "2026-05-07") {
  const id = readString(record.policy_id || record.policyId || record.id);
  const title = readString(record.title);
  const region = readString(record.region);
  const status = readString(record.status) || "unknown";
  if (!id || !title || !region) {
    return { policy: null, sources: [], warnings: ["missing id/title/region"] };
  }

  const { sources, warnings } = normalizePolicySourcesFromRecord(record);
  const sourceDate = readString(record.sourceDate || record.source_date) || fallbackSourceDate;
  const lastVerifiedAt = readString(record.lastVerifiedAt || record.last_verified_at);
  const metadata = isRecord(record.metadata) ? record.metadata : {};

  return {
    policy: {
      id,
      region,
      province: readString(record.province) || null,
      city: readString(record.city) || null,
      district: readString(record.district) || null,
      title,
      summary: readString(record.summary) || null,
      status,
      fineTags: normalizeStringArray(record.fineTags || record.fine_tags),
      sourceDate: parseIsoDate(sourceDate),
      lastVerifiedAt: lastVerifiedAt ? parseIsoDate(lastVerifiedAt) : null,
      isActive: typeof record.isActive === "boolean" ? record.isActive : true,
      priority: Number.isFinite(Number(record.priority)) ? Number(record.priority) : 0,
      metadata
    },
    sources,
    warnings
  };
}

function scoreCatalogPolicy(policy: PolicyCatalogItem, slots: PolicyCollectedSlots) {
  let score = Number(policy.priority || 0);
  const regionText = [policy.region, policy.province, policy.city, policy.district]
    .filter(Boolean)
    .join(" ");
  const requestedRegion = [slots.region?.rawText, slots.region?.province, slots.region?.city, slots.region?.district]
    .filter(Boolean)
    .join(" ");
  const content = [
    policy.title,
    policy.summary,
    policy.fineTags.join(" "),
    policy.sourcesSummary
  ].join(" ");

  if (!requestedRegion || regionText.includes(requestedRegion) || requestedRegion.includes(policy.city || policy.region)) {
    score += 20;
  } else if (/全国|国家/.test(regionText)) {
    score += 8;
  }

  if (policy.status === "open_apply") score += 12;
  if (policy.status === "entry_pending") score += 4;
  if (policy.status === "trial_watch") score += 2;
  if (policy.sources.some((source) => source.type === "apply_entry")) score += 10;
  if (policy.sources.some((source) => source.type === "official_original")) score += 6;
  if (policy.sources.some((source) => source.type === "pdf")) score += 3;

  const companyStatus = slots.companyStatus;
  if (companyStatus === "unregistered" && /(开办|注册地址|集群注册|园区入驻|个体户|小微|创业)/.test(content)) score += 16;
  if (companyStatus === "individual" && /(个体|小微|税费|减免|创业)/.test(content)) score += 14;
  if ((companyStatus === "company" || companyStatus === "existing_company") && /(小微|初创|数字经济|软件|AI|人工智能)/i.test(content)) score += 10;
  if (slots.industry?.label && content.includes(slots.industry.label)) score += 8;

  return score;
}

function hasCatalogRequestedRegion(slots: PolicyCollectedSlots) {
  return getCatalogRequestedRegionTokens(slots).length > 0;
}

function getCatalogRegionFit(policy: PolicyCatalogItem, slots: PolicyCollectedSlots): "local" | "national" | "mismatch" | "none" {
  const requestedTokens = getCatalogRequestedRegionTokens(slots);
  if (!requestedTokens.length) {
    return "none";
  }

  const policyTokens = [policy.region, policy.province, policy.city, policy.district]
    .map((value) => normalizeCatalogRegionText(value))
    .filter(Boolean);
  const policyText = policyTokens.join(" ");
  if (/(全国|国家|中国)/.test(policyText)) {
    return "national";
  }

  const matchesLocal = requestedTokens.some((requested) =>
    policyTokens.some((policyToken) => policyToken.includes(requested) || requested.includes(policyToken))
  );
  return matchesLocal ? "local" : "mismatch";
}

function getCatalogRequestedRegionTokens(slots: PolicyCollectedSlots) {
  return [
    slots.region?.district,
    slots.region?.city,
    slots.region?.province,
    slots.region?.rawText
  ]
    .map((value) => normalizeCatalogRegionText(value))
    .filter(Boolean);
}

function normalizeCatalogRegionText(value: unknown) {
  return String(value || "")
    .trim()
    .replace(/(市|省|区|县|新区|自治州|特别行政区)$/g, "");
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => readString(item)).filter(Boolean);
}

function parseIsoDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatIsoDate(date: Date | null) {
  return date ? date.toISOString().slice(0, 10) : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export { getDomainFromUrl };
