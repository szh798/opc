import axios from "axios";
import type { PolicySearchInput, PolicySearchProvider, PolicySearchRawResult } from "./policy.types";

function normalizeTimeout(value: number) {
  return Number.isFinite(value) && value > 0 ? value : 10000;
}

export class MockPolicySearchProvider implements PolicySearchProvider {
  readonly name = "mock";

  async search(input: PolicySearchInput): Promise<PolicySearchRawResult[]> {
    const region = input.region || "本地";
    const industry = input.industry || "小微企业";

    return [
      {
        title: `${region}小微企业创业扶持和园区入驻政策`,
        url: "https://www.gov.cn/zhengce/opc-policy-demo",
        content: `${region}面向${industry}、初创企业和小微主体提供创业扶持、园区入驻、租金支持和申报辅导。适用条件以官方申报通知为准。发布时间：2026-03-01。截止时间：2026-12-31。`,
        publishedDate: "2026-03-01",
        score: 0.91
      },
      {
        title: `${region}创业园区税收服务和注册地址支持线索`,
        url: "https://www.gov.cn/zhengce/2026-park-demo",
        content: `官方政务信息显示，部分园区会对符合条件的${industry}主体提供注册地址、税务服务和政策申报指引，需核验行业限制、纳税留存和社保人数要求。`,
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
    private readonly timeoutMs: number
  ) {}

  async search(input: PolicySearchInput): Promise<PolicySearchRawResult[]> {
    if (!this.apiKey) {
      return [];
    }

    const response = await axios.post(
      "https://api.tavily.com/search",
      {
        api_key: this.apiKey,
        query: input.query,
        search_depth: "basic",
        max_results: input.limit,
        include_answer: false,
        include_raw_content: false
      },
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
}): PolicySearchProvider {
  const providerName = String(input.providerName || "").trim().toLowerCase();
  if (input.enabled && providerName === "tavily" && input.apiKey) {
    return new TavilyPolicySearchProvider(input.apiKey, input.timeoutMs);
  }

  return new MockPolicySearchProvider();
}
