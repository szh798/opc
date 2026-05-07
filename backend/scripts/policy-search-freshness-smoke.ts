process.env.DATABASE_URL ||= "postgresql://opc:opc@127.0.0.1:5432/opc?schema=public";
process.env.POLICY_SEARCH_ENABLED = "false";
process.env.POLICY_SEARCH_PROVIDER = "mock";
process.env.POLICY_SEARCH_ALLOWED_DOMAINS = "gov.cn,zwfw.gov.cn,tax.gov.cn";
process.env.POLICY_SEARCH_FRESHNESS_DAYS = "365";
process.env.POLICY_SEARCH_TTL_MINUTES = "60";

import { PolicyOpcRelevanceService } from "../src/policy/policy-opc-relevance.service";
import { PolicyOpportunityService } from "../src/policy/policy-opportunity.service";
import {
  buildTavilySearchPayload,
  createPolicySearchProvider,
  TAVILY_RAW_CONTENT_MODE
} from "../src/policy/policy-search.providers";
import type { PolicyCollectedSlots, PolicySearchInput, PolicySearchProvider, PolicySearchRawResult } from "../src/policy/policy.types";

function assertOk(name: string, condition: unknown, detail = "") {
  const ok = !!condition;
  // eslint-disable-next-line no-console
  console.log(`[${ok ? "PASS" : "FAIL"}] ${name}${detail ? ` - ${detail}` : ""}`);
  if (!ok) {
    throw new Error(`${name} failed${detail ? `: ${detail}` : ""}`);
  }
}

function beijingToday() {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function datePlusDays(days: number) {
  const date = new Date(`${beijingToday()}T00:00:00+08:00`);
  date.setDate(date.getDate() + days);
  return new Date(date.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

const unregisteredSlots: PolicyCollectedSlots = {
  companyStatus: "unregistered",
  region: { city: "杭州", rawText: "杭州" },
  industry: { label: "AI工具", rawText: "AI工具" },
  age: { bucket: "not_started", rawText: "刚开始" },
  revenue: { bucket: "none", rawText: "没有收入" }
};

const individualSlots: PolicyCollectedSlots = {
  ...unregisteredSlots,
  companyStatus: "individual",
  age: { bucket: "lt_6m", rawText: "刚注册个体户" },
  revenue: { bucket: "lt_10k", rawText: "月收入几千" }
};

const companySlots: PolicyCollectedSlots = {
  ...unregisteredSlots,
  companyStatus: "company",
  age: { bucket: "6m_1y", rawText: "成立半年" },
  revenue: { bucket: "10k_100k", rawText: "月收入几万" }
};

class FakePolicySearchProvider implements PolicySearchProvider {
  readonly name = "fake";
  readonly calls: PolicySearchInput[] = [];

  constructor(private readonly results: PolicySearchRawResult[]) {}

  async search(input: PolicySearchInput) {
    this.calls.push({ ...input });
    return this.results;
  }
}

function rawPolicy(input: {
  title: string;
  url?: string;
  content: string;
  publishedDate?: string | null;
}): PolicySearchRawResult {
  return {
    title: input.title,
    url: input.url || `https://www.gov.cn/zhengce/${encodeURIComponent(input.title)}`,
    content: input.content,
    snippet: input.content,
    publishedDate: input.publishedDate || null,
    score: 0.9
  };
}

function serviceWithProvider(provider: PolicySearchProvider) {
  const service = new PolicyOpportunityService(new PolicyOpcRelevanceService());
  (service as any).provider = provider;
  return service;
}

async function searchCard(
  service: PolicyOpportunityService,
  query = "杭州 AI工具 政策",
  options: { forceRefresh?: boolean; slots?: PolicyCollectedSlots } = {}
) {
  return (service as any).searchAndBuildCard(options.slots || unregisteredSlots, query, {
    forceRefresh: options.forceRefresh
  });
}

async function run() {
  const opcRelevance = new PolicyOpcRelevanceService();
  const payload = buildTavilySearchPayload({
    query: "杭州 小微企业 补贴",
    region: "杭州",
    industry: "AI工具",
    companyStatus: "未注册主体",
    limit: 8,
    freshnessDays: 30
  }, {
    apiKey: "tvly-test",
    allowedDomains: ["gov.cn", "zwfw.gov.cn", "tax.gov.cn"]
  });
  assertOk("freshnessDays maps to Tavily start_date", typeof payload.start_date === "string" && payload.start_date.length === 10);
  assertOk("Tavily payload includes raw content mode", payload.include_raw_content === TAVILY_RAW_CONTENT_MODE);
  assertOk("Tavily payload includes country", payload.country === "china");
  assertOk("Tavily payload includes domains", payload.include_domains?.includes("gov.cn"));
  assertOk("unregistered query prioritizes address and park entry", /注册地址/.test(opcRelevance.buildSearchTerms("unregistered")) && /园区入驻/.test(opcRelevance.buildSearchTerms("unregistered")));
  assertOk("individual query prioritizes tax reduction", /个体工商户/.test(opcRelevance.buildSearchTerms("individual")) && /税费减免/.test(opcRelevance.buildSearchTerms("individual")));
  assertOk("company query prioritizes digital economy", /数字经济扶持/.test(opcRelevance.buildSearchTerms("company")));

  assertOk(
    "release-like tavily without api key fails",
    throws(() => createPolicySearchProvider({
      providerName: "tavily",
      apiKey: "",
      timeoutMs: 1000,
      enabled: true,
      releaseLike: true,
      allowedDomains: ["gov.cn"]
    }))
  );
  assertOk(
    "release-like mock provider fails",
    throws(() => createPolicySearchProvider({
      providerName: "mock",
      apiKey: "",
      timeoutMs: 1000,
      enabled: true,
      releaseLike: true,
      allowedDomains: ["gov.cn"]
    }))
  );

  const activeAddress = rawPolicy({
    title: "杭州创业园区集群注册地址和个体户入驻服务申报通知",
    content: `发布日期：${datePlusDays(-5)}。申报截止时间：${datePlusDays(30)}。适用对象：未注册个人创业者、个体工商户、初创小微企业。支持内容：集群注册、注册地址、园区入驻、创业补贴和场地扶持。`,
    publishedDate: datePlusDays(-5)
  });
  const individualTax = rawPolicy({
    title: "杭州个体工商户小微主体税费减免办理通知",
    content: `发布日期：${datePlusDays(-5)}。申报截止时间：${datePlusDays(30)}。适用对象：个体工商户、小微主体、小规模纳税人。支持内容：税费减免、增值税优惠、创业补贴。`,
    publishedDate: datePlusDays(-5)
  });
  const digitalCompany = rawPolicy({
    title: "杭州数字经济软件服务初创小微企业扶持通知",
    content: `发布日期：${datePlusDays(-5)}。申报截止时间：${datePlusDays(30)}。适用对象：数字经济、AI、软件服务、文化创意方向初创小微企业。支持内容：租金补贴、税费减免、项目辅导。`,
    publishedDate: datePlusDays(-5)
  });
  const expired = rawPolicy({
    title: "杭州园区创业补贴申报通知",
    content: `发布日期：${datePlusDays(-60)}。申报截止时间：${datePlusDays(-1)}。适用对象：个人创业者、个体工商户、初创小微企业。补贴标准：创业补贴。`,
    publishedDate: datePlusDays(-60)
  });
  const unknown = rawPolicy({
    title: "杭州园区注册地址政策线索",
    content: "适用对象：个人创业者、个体工商户、初创小微企业。支持内容：注册地址、园区入驻。请以官方窗口为准。",
    publishedDate: null
  });
  const marketing = rawPolicy({
    title: "营销站园区返税宣传",
    url: "https://example.com/policy",
    content: `发布日期：${datePlusDays(-3)}。申报截止时间：${datePlusDays(30)}。适用对象：小微企业。支持内容：返税。`,
    publishedDate: datePlusDays(-3)
  });
  const publicNotice = rawPolicy({
    title: "杭州创业补贴名单公示",
    content: `发布日期：${datePlusDays(-2)}。申报截止时间：${datePlusDays(30)}。内容为创业补贴名单公示和评审结果。`,
    publishedDate: datePlusDays(-2)
  });
  const policyInterpretation = rawPolicy({
    title: "杭州创业扶持政策解读",
    content: `发布日期：${datePlusDays(-2)}。内容为政策解读、一图读懂和新闻发布，并非申报通知。`,
    publishedDate: datePlusDays(-2)
  });
  const enterpriseQualification = rawPolicy({
    title: "杭州企业资质认定申报通知",
    content: `发布日期：${datePlusDays(-2)}。申报截止时间：${datePlusDays(30)}。适用对象：具备研发投入、固定资产投资和企业资质条件的企业。内容为企业资质认定。`,
    publishedDate: datePlusDays(-2)
  });
  const highTech = rawPolicy({
    title: "杭州高新技术企业认定申报通知",
    content: `发布日期：${datePlusDays(-2)}。申报截止时间：${datePlusDays(30)}。适用对象：已注册企业、高新技术企业认定、研发投入和知识产权条件。`,
    publishedDate: datePlusDays(-2)
  });
  const smeQualification = rawPolicy({
    title: "杭州中小企业认定结果公示",
    content: `发布日期：${datePlusDays(-2)}。内容为中小企业认定、认定名单、结果公示和评审结果。`,
    publishedDate: datePlusDays(-2)
  });

  const filterProvider = new FakePolicySearchProvider([marketing, expired, activeAddress]);
  const filterService = serviceWithProvider(filterProvider);
  const filterCard = await searchCard(filterService);
  const filterItems = ((filterCard.payload || {}).items || []) as any[];
  assertOk("freshnessDays passes to provider", filterProvider.calls[0]?.freshnessDays === 365);
  assertOk("business layer filters non-official URLs", filterItems.every((item) => String(item.source?.url || "").includes("gov.cn")));
  assertOk("expired policies are filtered", filterItems.every((item) => item.validityStatus !== "expired"));
  assertOk("filteredExpiredCount is tracked", filterCard.payload?.filteredExpiredCount === 1);
  assertOk("displayed policy items only use strong OPC relevance", filterItems.every((item) => item.opcRelevanceLevel === "high"));
  assertOk("park registered address is high for unregistered", filterItems[0]?.opcRelevanceLevel === "high" && filterItems[0]?.recommendedStage === "pre_registration");
  assertOk("OPC payload exposes score fields", typeof filterItems[0]?.opcRelevanceScore === "number" && Array.isArray(filterItems[0]?.matchedOpcSignals));

  const individualTaxCard = await searchCard(serviceWithProvider(new FakePolicySearchProvider([individualTax])), "杭州 个体户 税费减免", { slots: individualSlots });
  const individualTaxItem = (((individualTaxCard.payload || {}).items || []) as any[])[0];
  assertOk("individual tax reduction is high for individual user", individualTaxItem?.opcRelevanceLevel === "high" && individualTaxItem?.opportunityType === "tax_reduction");

  const companySupportCard = await searchCard(serviceWithProvider(new FakePolicySearchProvider([digitalCompany])), "杭州 数字经济 AI 软件服务 扶持", { slots: companySlots });
  const companySupportItem = (((companySupportCard.payload || {}).items || []) as any[])[0];
  assertOk("company/existing company can use digital economy support", companySupportItem?.opcRelevanceLevel === "high" && companySupportItem?.opportunityType === "industry_support");

  const allExpiredProvider = new FakePolicySearchProvider([expired]);
  const allExpiredCard = await searchCard(serviceWithProvider(allExpiredProvider), "杭州 过期政策");
  assertOk("all expired returns empty card", allExpiredCard.cardType === "policy_opportunity_empty");
  assertOk("all expired card has no items", Array.isArray(allExpiredCard.payload?.items) && allExpiredCard.payload.items.length === 0);
  assertOk("all expired card tracks count", allExpiredCard.payload?.filteredExpiredCount === 1);

  const unknownCard = await searchCard(serviceWithProvider(new FakePolicySearchProvider([unknown])), "杭州 未知时效政策");
  assertOk("unknown does not enter main recommendation", unknownCard.cardType === "policy_opportunity_low_confidence");
  assertOk("unknown item asks manual verification", /需人工核验/.test(JSON.stringify(unknownCard.payload?.items || [])));

  const nonApplicationItem = (serviceWithProvider(new FakePolicySearchProvider([])) as any).standardizeAndScore(publicNotice, unregisteredSlots, 0);
  assertOk("non-application page is downgraded", nonApplicationItem.opcRelevanceLevel === "irrelevant" || nonApplicationItem.confidence.finalConfidence < 0.75);

  const irrelevantCard = await searchCard(serviceWithProvider(new FakePolicySearchProvider([
    enterpriseQualification,
    highTech,
    smeQualification,
    publicNotice,
    policyInterpretation
  ])), "杭州 高新技术企业 中小企业认定 政策解读");
  assertOk("enterprise qualification pages are filtered from items", Array.isArray(irrelevantCard.payload?.items) && irrelevantCard.payload.items.length === 0);
  assertOk("high-tech certification is not recommended to unregistered user", irrelevantCard.cardType === "policy_opportunity_empty");
  assertOk("interpretation and public notice are not main opportunities", irrelevantCard.payload?.filteredIrrelevantCount === 5);

  const cacheProvider = new FakePolicySearchProvider([activeAddress]);
  const cacheService = serviceWithProvider(cacheProvider);
  await searchCard(cacheService, "杭州 缓存测试");
  await searchCard(cacheService, "杭州 缓存测试");
  assertOk("same search uses cache", cacheProvider.calls.length === 1);
  await searchCard(cacheService, "杭州 缓存测试", { forceRefresh: true });
  assertOk("refresh bypasses cache", cacheProvider.calls.length === 2);

  const freshnessProvider = new FakePolicySearchProvider([activeAddress]);
  const freshnessService = serviceWithProvider(freshnessProvider);
  (freshnessService as any).config.policySearchFreshnessDays = 365;
  await searchCard(freshnessService, "杭州 freshness 缓存测试");
  (freshnessService as any).config.policySearchFreshnessDays = 30;
  await searchCard(freshnessService, "杭州 freshness 缓存测试");
  assertOk("freshness change avoids old cache", freshnessProvider.calls.length === 2);

  const activeItem = filterItems[0];
  assertOk("publishDate is ISO date", /^\d{4}-\d{2}-\d{2}$/.test(String(activeItem.publishDate || "")));
  assertOk("deadlineDate is ISO date", /^\d{4}-\d{2}-\d{2}$/.test(String(activeItem.deadlineDate || "")));
}

function throws(fn: () => unknown) {
  try {
    fn();
    return false;
  } catch (_error) {
    return true;
  }
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    process.exit(1);
  });
