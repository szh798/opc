import { Injectable } from "@nestjs/common";
import type {
  PolicyCollectedSlots,
  PolicyCompanyStatus,
  PolicyOpportunityType,
  PolicyRecommendedStage,
  PolicyOpcRelevanceLevel,
  PolicyOpcRelevanceStatus
} from "./policy.types";

export type PolicyOpcRelevanceResult = {
  opcRelevanceScore: number;
  opcRelevanceLevel: PolicyOpcRelevanceLevel;
  opcRelevanceStatus: PolicyOpcRelevanceStatus;
  opcRelevanceReason: string;
  matchedOpcSignals: string[];
  mismatchReasons: string[];
  recommendedStage: PolicyRecommendedStage;
  opportunityType: PolicyOpportunityType;
};

const SIGNAL_GROUPS: Array<{ label: string; re: RegExp; weight: number }> = [
  { label: "OPC/一人创业", re: /(OPC|一人创业|一人公司|个人创业|单人创业|solo\s*founder|one[- ]person company)/i, weight: 0.3 },
  { label: "开办/注册办理", re: /(开办|一类事|专窗|一日办结|1\s*日办结|政务服务|注册办理|注册登记|工位注册|未注册|准备注册|住所承诺|注册地址|集群注册|住所托管|商务秘书)/, weight: 0.28 },
  { label: "个体户", re: /(个体工商户|个体户|个体经济|个转企)/, weight: 0.24 },
  { label: "小微企业", re: /(小微企业|中小微企业|小型微型企业|小规模纳税人|小微主体)/, weight: 0.22 },
  { label: "初创企业", re: /(初创|初次创业|首次创业|创业者|自主创业|创业生态|就业创业|启动资金)/, weight: 0.24 },
  { label: "园区/空间入驻", re: /(园区入驻|入驻园区|入驻|创业园|孵化器|众创空间|创业孵化|产业社区|创业社区|服务专区|OPC专区|工位|空间|场地支持)/, weight: 0.22 },
  { label: "创业补贴", re: /(创业补贴|一次性创业|创业扶持|创业带动就业|社保补贴|补贴|扶持资金|启动资金)/, weight: 0.22 },
  { label: "税费减免", re: /(税费减免|减税|免税|税收优惠|增值税|所得税|小规模纳税人)/, weight: 0.18 },
  { label: "租金补贴", re: /(租金补贴|房租补贴|场地租金|办公场地|房租减免|免租|人才公寓)/, weight: 0.18 },
  { label: "创业担保贷款", re: /(创业担保贷款|创业贷款|贴息贷款|贷款贴息|创业贴息|融资)/, weight: 0.2 },
  { label: "数字经济/AI/软件服务/文化创意", re: /(数字经济|人工智能|AI|软件服务|软件和信息服务|文化创意|文创|算力|算力券|模型券|场景)/i, weight: 0.18 }
];

const BLOCKING_GROUPS: Array<{ label: string; re: RegExp }> = [
  { label: "高新技术企业", re: /高新技术企业/ },
  { label: "专精特新", re: /专精特新/ },
  { label: "规上企业", re: /(规上企业|规模以上)/ },
  { label: "企业资质认定", re: /(企业资质|资质认定|认定企业|认定名单|瞪羚|独角兽|总部企业|绿色工厂)/ },
  { label: "名单公示", re: /(名单公示|结果公示|评审结果|拟认定|拟入选|公示名单)/ },
  { label: "政策解读", re: /(政策解读|一图读懂|问答解读|新闻发布|工作动态|会议通知)/ },
  { label: "产业项目", re: /(产业项目|工业企业|技改|固定资产投资|研发投入|首台套|外贸|出口|采购|项目验收)/ }
];

@Injectable()
export class PolicyOpcRelevanceService {
  buildSearchTerms(companyStatus: PolicyCompanyStatus | null) {
    switch (companyStatus) {
      case "unregistered":
        return "OPC 一人创业 开办 注册地址 集群注册 个体户 小微企业 园区入驻 创业补贴 创业担保贷款";
      case "individual":
        return "OPC 个体工商户 小微主体 税费减免 创业补贴 租金补贴 小规模纳税人";
      case "company":
      case "existing_company":
        return "OPC 小微企业 初创企业 数字经济扶持 AI 软件服务 文化创意 税费减免 租金补贴";
      default:
        return "OPC 一人创业 个体工商户 小微企业 初创企业 创业补贴 园区入驻";
    }
  }

  ensureSearchQuery(query: string, slots: PolicyCollectedSlots) {
    const base = String(query || "").trim();
    const terms = this.buildSearchTerms(slots.companyStatus);
    return hasAnySignal(base) ? base : `${base || formatFallbackRegion(slots)} ${terms} 申报 通知 官方`;
  }

  evaluate(input: {
    title: string;
    content: string;
    slots: PolicyCollectedSlots;
    nonApplicationPage?: boolean;
  }): PolicyOpcRelevanceResult {
    const text = `${input.title}\n${input.content}`;
    const matchedOpcSignals = collectSignals(text);
    const mismatchReasons = collectMismatchReasons(text, input.slots, input.nonApplicationPage);
    const opportunityType = resolveOpportunityType(text);
    const recommendedStage = resolveRecommendedStage(text, input.slots.companyStatus, opportunityType, mismatchReasons);
    const positiveScore = matchedOpcSignals.reduce((sum, label) => {
      const signal = SIGNAL_GROUPS.find((item) => item.label === label);
      return sum + (signal?.weight || 0);
    }, 0);
    const statusFit = scoreStatusFit(input.slots.companyStatus, recommendedStage);
    const mismatchPenalty = Math.min(0.75, mismatchReasons.length * 0.18);
    const score = roundScore(Math.max(0, Math.min(1, positiveScore + statusFit - mismatchPenalty)));
    const level = resolveLevel(score, recommendedStage, mismatchReasons);

    return {
      opcRelevanceScore: score,
      opcRelevanceLevel: level,
      opcRelevanceStatus: levelToLegacyStatus(level),
      opcRelevanceReason: buildReason(level, matchedOpcSignals, mismatchReasons, recommendedStage),
      matchedOpcSignals,
      mismatchReasons,
      recommendedStage,
      opportunityType
    };
  }

  scoreLevel(level: PolicyOpcRelevanceLevel) {
    switch (level) {
      case "high":
        return 1;
      case "medium":
        return 0.72;
      case "low":
        return 0.42;
      case "irrelevant":
        return 0;
      default:
        return 0;
    }
  }
}

function collectSignals(text: string) {
  return SIGNAL_GROUPS.filter((item) => item.re.test(text)).map((item) => item.label);
}

function collectMismatchReasons(text: string, slots: PolicyCollectedSlots, nonApplicationPage?: boolean) {
  const reasons = BLOCKING_GROUPS.filter((item) => item.re.test(text)).map((item) => item.label);
  if (nonApplicationPage && !reasons.includes("政策解读") && !reasons.includes("名单公示")) {
    reasons.push("非申报页");
  }
  if (slots.companyStatus === "unregistered" && /(高新技术企业|专精特新|规上企业|规模以上|企业资质|资质认定|认定企业)/.test(text)) {
    reasons.push("未注册阶段暂不适合企业资质类政策");
  }
  return Array.from(new Set(reasons));
}

function resolveOpportunityType(text: string): PolicyOpportunityType {
  if (/(注册地址|集群注册|住所托管|商务秘书|注册登记|开办|一类事|专窗|住所承诺)/.test(text)) return "registered_address";
  if (/(园区入驻|入驻园区|入驻|创业园|孵化器|众创空间|创业孵化|产业社区|创业社区|服务专区|OPC专区|工位|空间)/.test(text)) return "park_entry";
  if (/(数字经济|人工智能|AI|软件服务|软件和信息服务|文化创意|文创|算力|算力券|模型券|场景)/i.test(text)) return "industry_support";
  if (/(税费减免|减税|免税|税收优惠|增值税|所得税)/.test(text)) return "tax_reduction";
  if (/(租金补贴|房租补贴|场地租金|办公场地|房租减免|免租|人才公寓)/.test(text)) return "rent_subsidy";
  if (/(创业担保贷款|创业贷款|贴息贷款|贷款贴息|创业贴息|融资)/.test(text)) return "startup_loan";
  if (/(创业补贴|一次性创业|创业扶持|创业带动就业|社保补贴|补贴|启动资金)/.test(text)) return "startup_subsidy";
  if (/(高新技术企业|专精特新|规上企业|企业资质|资质认定)/.test(text)) return "qualification";
  if (/(名单公示|结果公示|评审结果|拟认定|公示名单)/.test(text)) return "public_notice";
  if (/(政策解读|一图读懂|问答解读|新闻发布|工作动态|会议通知)/.test(text)) return "interpretation";
  return "other";
}

function resolveRecommendedStage(
  text: string,
  companyStatus: PolicyCompanyStatus | null,
  opportunityType: PolicyOpportunityType,
  mismatchReasons: string[]
): PolicyRecommendedStage {
  if (mismatchReasons.some((item) => /资质|高新|专精特新|规上|公示|解读|名单/.test(item))) {
    return "not_recommended";
  }
  if (/(OPC|一人创业|开办|一类事|专窗|注册地址|集群注册|住所承诺|个体户|个体工商户|园区入驻|入驻|注册登记|工位注册|工位|空间|场景服务|创业社区|产业社区|服务专区|未注册|准备注册)/i.test(text)) {
    return companyStatus === "existing_company" ? "just_registered" : "pre_registration";
  }
  if (/(创业补贴|一次性创业|创业担保贷款|租金补贴|场地|免租|人才公寓|启动资金)/.test(text)) {
    return companyStatus === "unregistered" ? "pre_registration" : "just_registered";
  }
  if (/(税费减免|小规模纳税人|小微企业|初创企业)/.test(text)) {
    return companyStatus === "unregistered" ? "just_registered" : "early_revenue";
  }
  if (opportunityType === "industry_support") {
    return companyStatus === "unregistered" ? "early_revenue" : "growth";
  }
  return "not_recommended";
}

function scoreStatusFit(companyStatus: PolicyCompanyStatus | null, stage: PolicyRecommendedStage) {
  if (stage === "not_recommended") return 0;
  if (companyStatus === "unregistered" && stage === "pre_registration") return 0.28;
  if (companyStatus === "individual" && (stage === "pre_registration" || stage === "just_registered" || stage === "early_revenue")) return 0.24;
  if ((companyStatus === "company" || companyStatus === "existing_company") && stage !== "pre_registration") return 0.22;
  return 0.12;
}

function resolveLevel(score: number, stage: PolicyRecommendedStage, mismatchReasons: string[]): PolicyOpcRelevanceLevel {
  if (stage === "not_recommended" || mismatchReasons.some((item) => /资质|高新|专精特新|规上|公示|解读|名单/.test(item))) {
    return "irrelevant";
  }
  if (score >= 0.78) return "high";
  if (score >= 0.55) return "medium";
  if (score >= 0.35) return "low";
  return "irrelevant";
}

function levelToLegacyStatus(level: PolicyOpcRelevanceLevel): PolicyOpcRelevanceStatus {
  switch (level) {
    case "high":
      return "strong";
    case "medium":
      return "partial";
    case "low":
      return "weak";
    case "irrelevant":
      return "irrelevant";
  }
}

function buildReason(
  level: PolicyOpcRelevanceLevel,
  matchedOpcSignals: string[],
  mismatchReasons: string[],
  stage: PolicyRecommendedStage
) {
  if (level === "irrelevant") {
    return mismatchReasons.length
      ? `暂不适合当前阶段：${mismatchReasons.join("、")}`
      : "暂不适合当前一人创业阶段";
  }
  const prefix = level === "high" ? "值得核验" : level === "medium" ? "可能相关" : "仅作线索";
  const signals = matchedOpcSignals.length ? matchedOpcSignals.join("、") : "一人创业相关信号";
  return `${prefix}：命中${signals}，适合阶段为${formatStage(stage)}`;
}

function hasAnySignal(query: string) {
  return /(OPC|一人创业|开办|注册地址|集群注册|个体户|个体工商户|小微企业|初创企业|园区入驻|创业补贴|税费减免|租金补贴|创业担保贷款|数字经济|AI|软件服务|文化创意|算力|模型券)/i.test(query);
}

function formatFallbackRegion(slots: PolicyCollectedSlots) {
  return slots.region?.district || slots.region?.city || slots.region?.province || slots.region?.rawText || "本地";
}

function formatStage(stage: PolicyRecommendedStage) {
  switch (stage) {
    case "pre_registration":
      return "注册前";
    case "just_registered":
      return "刚注册";
    case "early_revenue":
      return "早期营收";
    case "growth":
      return "增长期";
    default:
      return "暂不推荐";
  }
}

function roundScore(value: number) {
  return Math.max(0, Math.min(1, Number(value.toFixed(2))));
}
