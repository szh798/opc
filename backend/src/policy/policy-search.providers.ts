import axios from "axios";
import type { PolicySearchInput, PolicySearchProvider, PolicySearchRawResult } from "./policy.types";

const TAVILY_SEARCH_URL = "https://api.tavily.com/search";
// Tavily documents include_raw_content values as boolean | "markdown" | "text".
// Keep the provider-specific literal here so API mapping stays centralized and testable.
export const TAVILY_RAW_CONTENT_MODE = "text" as const;

export type TavilySearchPayload = {
  api_key: string;
  query: string;
  search_depth: "advanced";
  max_results: number;
  include_answer: false;
  include_raw_content: typeof TAVILY_RAW_CONTENT_MODE;
  country: "china";
  start_date?: string;
  include_domains?: string[];
};

function normalizeTimeout(value: number) {
  return Number.isFinite(value) && value > 0 ? value : 10000;
}

function normalizePositiveInteger(value: unknown, fallback: number) {
  const parsed = Number.parseInt(String(value || "").trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function formatBeijingDate(date: Date) {
  return new Date(date.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function buildStartDateFromFreshnessDays(freshnessDays?: number) {
  const days = normalizePositiveInteger(freshnessDays, 365);
  const start = new Date(Date.now() - Math.max(0, days - 1) * 24 * 60 * 60 * 1000);
  return formatBeijingDate(start);
}

export function buildTavilySearchPayload(input: PolicySearchInput, options: {
  apiKey: string;
  allowedDomains?: string[];
}): TavilySearchPayload {
  const allowedDomains = (options.allowedDomains || [])
    .map((domain) => String(domain || "").trim().replace(/^www\./, "").toLowerCase())
    .filter(Boolean);

  const payload: TavilySearchPayload = {
    api_key: options.apiKey,
    query: input.query,
    search_depth: "advanced",
    max_results: Math.max(1, Math.min(20, normalizePositiveInteger(input.limit, 6))),
    include_answer: false,
    include_raw_content: TAVILY_RAW_CONTENT_MODE,
    country: "china",
    start_date: buildStartDateFromFreshnessDays(input.freshnessDays)
  };

  if (allowedDomains.length) {
    payload.include_domains = allowedDomains;
  }

  return payload;
}

export class MockPolicySearchProvider implements PolicySearchProvider {
  readonly name = "mock";

  async search(input: PolicySearchInput): Promise<PolicySearchRawResult[]> {
    const region = input.region || "本地";
    const industry = input.industry || "小微企业";

    return [
      {
        title: `${region}个人创业和个体工商户创业扶持申报通知`,
        url: "https://www.gov.cn/zhengce/opc-policy-demo",
        content: `${region}面向${industry}个人创业者、个体工商户、初创小微主体提供创业补贴、创业担保贷款、场地租金支持和申报辅导。适用条件以官方申报通知为准。发布时间：2026-03-01。截止时间：2026-12-31。`,
        publishedDate: "2026-03-01",
        score: 0.91
      },
      {
        title: `${region}一人有限公司和小规模纳税人创业园区服务线索`,
        url: "https://www.gov.cn/zhengce/2026-park-demo",
        content: `官方政务信息显示，部分园区会对符合条件的${industry}个人创业者、一人有限公司或小规模纳税人提供注册地址、税务服务和政策申报指引，需核验行业限制、纳税留存和社保人数要求。发布时间：2026-02-15。截止时间：2026-12-31。`,
        publishedDate: "2026-02-15",
        score: 0.84
      }
    ];
  }
}

export class TavilyPolicySearchProvider implements PolicySearchProvider {
  readonly name = "tavily";

  constructor(
    private readonly apiKey: string,
    private readonly timeoutMs: number,
    private readonly allowedDomains: string[] = []
  ) {}

  async search(input: PolicySearchInput): Promise<PolicySearchRawResult[]> {
    if (!this.apiKey) {
      return [];
    }

    const response = await axios.post(
      TAVILY_SEARCH_URL,
      buildTavilySearchPayload(input, {
        apiKey: this.apiKey,
        allowedDomains: this.allowedDomains
      }),
      {
        timeout: normalizeTimeout(this.timeoutMs),
        validateStatus: () => true
      }
    );

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`policy search provider failed: ${response.status}`);
    }

    const results = Array.isArray(response.data?.results) ? response.data.results : [];
    return results
      .map((item: Record<string, unknown>) => ({
        title: String(item.title || "").trim(),
        url: String(item.url || "").trim(),
        content: String(item.content || item.raw_content || "").trim(),
        snippet: String(item.snippet || item.content || "").trim(),
        publishedDate:
          typeof item.published_date === "string"
            ? item.published_date
            : typeof item.publishedDate === "string"
              ? item.publishedDate
              : null,
        rawPublishedDate:
          typeof item.published_date === "string"
            ? item.published_date
            : typeof item.publishedDate === "string"
              ? item.publishedDate
              : null,
        score: typeof item.score === "number" ? item.score : undefined
      }))
      .filter((item: PolicySearchRawResult) => !!item.title && !!item.url);
  }
}

export function createPolicySearchProvider(input: {
  providerName: string;
  apiKey: string;
  timeoutMs: number;
  enabled: boolean;
  allowedDomains?: string[];
  releaseLike?: boolean;
}): PolicySearchProvider {
  const providerName = String(input.providerName || "").trim().toLowerCase();
  if (input.releaseLike && input.enabled && providerName === "mock") {
    throw new Error("MockPolicySearchProvider is not allowed in release-like environments");
  }

  if (input.enabled && providerName === "tavily" && input.apiKey) {
    return new TavilyPolicySearchProvider(input.apiKey, input.timeoutMs, input.allowedDomains || []);
  }

  if (input.releaseLike && input.enabled) {
    throw new Error(`Policy search provider ${providerName || "unset"} is not configured for release-like environments`);
  }

  return new MockPolicySearchProvider();
}
