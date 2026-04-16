import { Injectable, Logger } from "@nestjs/common";
import type { RouterMode } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { getAppConfig } from "../shared/app-config";
import { createPolicySearchProvider } from "./policy-search.providers";
import {
  PARK_MATCH_FLOW_KEY,
  POLICY_SLOT_STEPS,
  PolicyCollectedSlots,
  PolicyConfidenceScore,
  PolicyDetail,
  PolicyMatchState,
  PolicyOpportunityCard,
  PolicySearchInput,
  PolicySearchProvider,
  PolicySearchRawResult,
  PolicySlotStep,
  PolicyType,
  ScoredPolicyDetail
} from "./policy.types";

const POLICY_ROUTE_ACTIONS = new Set([
  "route_park",
  "route_park_unregistered",
  "route_park_registered",
  "park_match",
  "company_park_followup",
  "flow_exit",
  "user_wants_other"
]);

// 分支点（ask_company_status 之后）出来的两个快捷回复。这两个动作是园区流
// 的"正常离场出口"：policy_to_asset_audit 直接把用户导入资产盘点对话流；
// policy_keep_chatting 则让用户先随便聊聊，LLM 再兜底把话题拉回资产盘点。
const POLICY_EXIT_TO_OTHER_FLOW = new Set(["policy_to_asset_audit", "policy_keep_chatting"]);

const POLICY_CARD_ACTIONS = new Set(["policy_explain", "save_policy_watch"]);

const POLICY_INTENT_RE =
  /(政策|园区|薅羊毛|补贴|返税|税收优惠|创业扶持|入驻|注册公司|个体户|有限公司|park|policy|subsidy|tax rebate|tax refund)/i;

const ACTIVE_FLOW_STEP_RE =
  /(asset|inventory|pricing|business_health|action_plan|artifact:asset_radar|artifact:pricing_card|artifact:business_health|artifact:action_plan_48h|fulltime|locked)/i;

const CITY_HINTS = [
  "北京",
  "上海",
  "广州",
  "深圳",
  "杭州",
  "苏州",
  "南京",
  "成都",
  "重庆",
  "武汉",
  "西安",
  "长沙",
  "合肥",
  "郑州",
  "青岛",
  "宁波",
  "厦门",
  "天津",
  "佛山",
  "东莞"
];

const PROVINCE_HINTS = [
  "浙江",
  "江苏",
  "广东",
  "山东",
  "四川",
  "湖北",
  "湖南",
  "安徽",
  "河南",
  "福建",
  "陕西",
  "重庆",
  "北京",
  "上海",
  "天津"
];

const POLICY_TYPE_KEYWORDS: Array<{ type: PolicyType; re: RegExp }> = [
  { type: "tax_rebate", re: /(返税|税收|退税|纳税|tax)/i },
  { type: "rent_support", re: /(租金|房租|办公场地|场地)/i },
  { type: "talent", re: /(人才|就业|社保|高校|毕业生)/i },
  { type: "registration", re: /(注册|注册地址|工商|主体)/i },
  { type: "park_entry", re: /(园区|入驻|产业园|孵化器)/i },
  { type: "financing", re: /(融资|贷款|贴息|基金)/i },
  { type: "subsidy", re: /(补贴|扶持|奖励|资助)/i }
];

const DEFAULT_ALLOWED_DOMAINS = ["gov.cn", "zwfw.gov.cn", "tax.gov.cn"];

type PolicyTurnInput = {
  parkingLot: {
    policyMatch?: PolicyMatchState | null;
  };
  input: {
    inputType: string;
    text?: string;
    routeAction?: string | null;
    metadata?: Record<string, unknown>;
  };
  userId: string;
  routeReason: string;
};

@Injectable()
export class PolicyOpportunityService {
  private readonly logger = new Logger(PolicyOpportunityService.name);
  private readonly config = getAppConfig();
  private readonly provider: PolicySearchProvider = createPolicySearchProvider({
    providerName: this.config.policySearchProvider,
    apiKey: this.config.policySearchApiKey,
    timeoutMs: this.config.policySearchTimeoutMs,
    enabled: this.config.policySearchEnabled
  });
  private readonly allowedDomains = this.config.policySearchAllowedDomains.length
    ? this.config.policySearchAllowedDomains
    : DEFAULT_ALLOWED_DOMAINS;
  private readonly searchCache = new Map<string, { expiresAt: number; results: PolicySearchRawResult[] }>();
  private static readonly SEARCH_CACHE_MAX_SIZE = 500;

  // 定期清理过期缓存条目
  private readonly _cacheCleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of this.searchCache) {
      if (entry.expiresAt <= now) {
        this.searchCache.delete(key);
      }
    }
  }, 10 * 60 * 1000);

  isPolicyRouteAction(routeAction?: string | null) {
    return POLICY_ROUTE_ACTIONS.has(String(routeAction || "").trim());
  }

  isPolicyCardAction(routeAction?: string | null) {
    return POLICY_CARD_ACTIONS.has(String(routeAction || "").trim());
  }

  isPolicyIntentText(text?: string | null) {
    return POLICY_INTENT_RE.test(String(text || ""));
  }

  // Phase 2·1 —— 供 router 在 Dify 工作流吐出 [HANDOFF_TO_PARK] / [GOTO_PARK] 时主动激活政策流。
  // 返回一个 step=ask_company_status 的初始 PolicyMatchState，写回 parkingLot.policyMatch 后，
  // 下一轮 resolveRoutingDecision 里 isPolicyFlowActive() 会返回 true，直接把用户送进 steward/policy。
  createInitialPolicyMatch(): PolicyMatchState {
    return this.createInitialPolicyMatchState();
  }

  isPolicyFlowActive(policyMatch?: PolicyMatchState | null) {
    if (!policyMatch || policyMatch.flowKey !== PARK_MATCH_FLOW_KEY) return false;
    // branch_asset_audit 是"等用户点好的/聊点其他的"的分支点，算挂起态：
    //   - 不再自动把路由绑死到 steward（避免用户随便打字也被送进政策流）
    //   - 但仍然会被 isAtBranchDecision 捕捉到，用于 buildSessionSnapshot 动态下发快捷回复
    if (policyMatch.step === "completed" || policyMatch.step === "branch_asset_audit") return false;
    return true;
  }

  isAtPolicyBranchDecision(policyMatch?: PolicyMatchState | null) {
    return !!policyMatch && policyMatch.flowKey === PARK_MATCH_FLOW_KEY && policyMatch.step === "branch_asset_audit";
  }

  isAllowedPolicyExit(routeAction?: string | null) {
    const normalized = String(routeAction || "").trim();
    return (
      normalized === "flow_exit" ||
      normalized === "user_wants_other" ||
      POLICY_EXIT_TO_OTHER_FLOW.has(normalized)
    );
  }

  isPolicyExitToOtherFlow(routeAction?: string | null) {
    return POLICY_EXIT_TO_OTHER_FLOW.has(String(routeAction || "").trim());
  }

  shouldProtectActiveFlow(input: {
    mode: RouterMode;
    currentStep?: string | null;
    routeAction?: string | null;
    text?: string | null;
    policyMatch?: PolicyMatchState | null;
  }) {
    if (!this.hasPolicyIntent(input.routeAction, input.text)) {
      return false;
    }
    if (this.isAllowedPolicyExit(input.routeAction) || this.isPolicyFlowActive(input.policyMatch)) {
      return false;
    }
    return input.mode === "locked" || ACTIVE_FLOW_STEP_RE.test(String(input.currentStep || ""));
  }

  shouldHandlePolicyTurn(input: {
    routeReason: string;
    routeAction?: string | null;
    text?: string | null;
    policyMatch?: PolicyMatchState | null;
  }) {
    // 离场动作（好的 / 聊点其他的）不走 policy turn —— 让 router 按 ROUTE_ACTION_DECISIONS
    // 把 agent 切到 asset / master，然后让对应 chatflow 接管回复。
    if (this.isPolicyExitToOtherFlow(input.routeAction)) {
      return false;
    }
    return (
      String(input.routeReason || "").startsWith("policy_") ||
      this.isPolicyFlowActive(input.policyMatch) ||
      this.hasPolicyIntent(input.routeAction, input.text) ||
      this.isPolicyCardAction(input.routeAction)
    );
  }

  normalizePolicyMatchState(value: unknown): PolicyMatchState | null {
    if (!isRecord(value)) {
      return null;
    }
    const rawSlots = isRecord(value.collectedSlots) ? value.collectedSlots : {};
    const step = POLICY_SLOT_STEPS.includes(String(value.step || "") as PolicySlotStep)
      ? (String(value.step) as PolicySlotStep)
      : "ask_company_status";

    return {
      flowKey: PARK_MATCH_FLOW_KEY,
      step,
      collectedSlots: {
        companyStatus: normalizeCompanyStatus(rawSlots.companyStatus),
        region: normalizeRegion(rawSlots.region),
        industry: normalizeIndustry(rawSlots.industry),
        age: normalizeAge(rawSlots.age),
        revenue: normalizeRevenue(rawSlots.revenue)
      },
      lastQuestion: typeof value.lastQuestion === "string" ? value.lastQuestion : "",
      searchStatus:
        value.searchStatus === "searching" || value.searchStatus === "completed" || value.searchStatus === "failed"
          ? value.searchStatus
          : "idle",
      lastSearchAt: typeof value.lastSearchAt === "string" ? value.lastSearchAt : null,
      lastSearchQuery: typeof value.lastSearchQuery === "string" ? value.lastSearchQuery : null,
      lastResultCardId: typeof value.lastResultCardId === "string" ? value.lastResultCardId : null
    };
  }

  buildSwitchConfirmCard(): PolicyOpportunityCard {
    return {
      cardType: "policy_flow_switch_confirm",
      title: "要先切去查政策吗？",
      description: "你现在还在当前流程里。要先暂停它，切去查政策/园区机会吗？",
      primaryText: "切去查政策",
      secondaryText: "继续当前流程",
      primaryAction: "flow_exit",
      secondaryAction: "continue_current_flow",
      cardStyle: "soft",
      actions: [
        { type: "ask_agent_explain", label: "先解释区别" },
        { type: "start_asset_audit", label: "先盘资产" }
      ]
    };
  }

  async handlePolicyTurn(input: PolicyTurnInput): Promise<{
    answer: string;
    nextQuestion: string;
    card?: PolicyOpportunityCard;
    policyMatch?: PolicyMatchState | null;
  }> {
    const routeAction = String(input.input.routeAction || "").trim();
    if (input.routeReason === "policy_flow_switch_confirm") {
      return {
        answer: "你现在还在当前流程里。要先暂停它，切去查政策/园区机会吗？",
        nextQuestion: "",
        card: this.buildSwitchConfirmCard()
      };
    }

    if (routeAction === "continue_current_flow") {
      return {
        answer: "好，我们先不切走，继续把当前这条线做完。",
        nextQuestion: ""
      };
    }

    if (routeAction === "policy_explain") {
      return {
        answer: "我帮你拆政策时会先看三件事：来源是不是官方、条件是不是匹配你、有没有纳税/社保/注册地址这些隐性要求。你可以把具体政策链接发我，我会按这三项继续判断。",
        nextQuestion: ""
      };
    }

    if (routeAction === "save_policy_watch") {
      return {
        answer: "已经帮你把这类政策机会加入关注。后面我们可以围绕城市、行业和主体状态继续追踪。",
        nextQuestion: ""
      };
    }

    const userText = String(input.input.text || "").trim();
    const priorPolicyMatch = this.normalizePolicyMatchState(input.parkingLot.policyMatch);
    let policyMatch = priorPolicyMatch || this.createInitialPolicyMatchState();
    // 第一次进入园区流 / 主动重置时，才允许发"我先不急着给你甩一堆政策名词..."这种铺垫开场白；
    // 否则同一槽位里用户答不上来就会看到一模一样的复读机，完全不像真人在聊。
    let isFreshEntry = !priorPolicyMatch;

    if (
      policyMatch.step === "completed" ||
      policyMatch.step === "branch_asset_audit" ||
      routeAction === "flow_exit" ||
      routeAction === "user_wants_other"
    ) {
      policyMatch = this.createInitialPolicyMatchState();
      isFreshEntry = true;
    }

    // branch_asset_audit 是"推完政策卡 + 抛出结尾钩子"之后的分支点，等待用户点 好的 / 聊点其他的。
    // 用户若在这里直接打字（没点快捷回复），就把状态清掉，让 router 正常路由，LLM 兜底接管。
    if (policyMatch.step === "branch_asset_audit") {
      return {
        answer: "",
        nextQuestion: "",
        policyMatch: null
      };
    }

    // 确认词（好的 / ok / 嗯 / 明白 等）早短路：放在解析槽位之前，避免被 parseIndustry 这类宽松解析器
    // 误收成真实答案（比如把"好的"当行业名写进 slot）。遇到填充词就把当前问题再抛一次。
    if (
      userText &&
      isAskStep(policyMatch.step) &&
      /^(好的|好|ok|恩|嗯|可以|没问题|是|是的|对|懂了|明白)$/i.test(userText)
    ) {
      const question = this.questionForStep(policyMatch.step);
      return {
        answer: question,
        nextQuestion: question,
        policyMatch: { ...policyMatch, lastQuestion: question }
      };
    }

    const parsed = this.parseCurrentSlot(policyMatch.step, userText);
    if (parsed.matched) {
      policyMatch = {
        ...policyMatch,
        collectedSlots: {
          ...policyMatch.collectedSlots,
          [parsed.slotKey]: parsed.value
        }
      };
    } else if (userText && isAskStep(policyMatch.step)) {
      const question = this.questionForStep(policyMatch.step);
      policyMatch = {
        ...policyMatch,
        lastQuestion: question
      };
      // 首次进入当前槽位且没解析出答案 → 允许发完整铺垫 + 问题
      // 同一槽位反复没解析 → 发更短的澄清 + 选项 + 问题，不要再复读开场白
      const prefix = isFreshEntry
        ? this.rephraseSlotQuestion(policyMatch.step)
        : this.clarifySlotQuestion(policyMatch.step);
      return {
        answer: [prefix, question].filter(Boolean).join("\n\n"),
        nextQuestion: question,
        policyMatch
      };
    }

    const nextStep = this.nextMissingStep(policyMatch.collectedSlots);
    if (nextStep) {
      const question = this.questionForStep(nextStep);
      policyMatch = {
        ...policyMatch,
        step: nextStep,
        lastQuestion: question,
        searchStatus: "idle"
      };
      // answer 必须带上下一个问题 —— 否则 transitionMessage 对 ask_age / ask_revenue 返回空串，
      // 上层会兜底成"我在，继续说。"，用户就彻底不知道自己被问了什么。
      const transition = this.transitionMessage(nextStep, parsed.matched);
      const combined = [transition, question].filter(Boolean).join("\n\n");
      return {
        answer: combined,
        nextQuestion: question,
        policyMatch
      };
    }

    const query = this.buildSearchQuery(policyMatch.collectedSlots);
    policyMatch = {
      ...policyMatch,
      step: "searching",
      searchStatus: "searching",
      lastQuestion: "",
      lastSearchQuery: query
    };

    const card = await this.searchAndBuildCard(policyMatch.collectedSlots, query);
    // 关键：推完卡之后不直接进 completed，而是停在 branch_asset_audit。
    // buildSessionSnapshot 在这一步会下发两颗硬编码快捷回复「好的 / 聊点其他的」——
    // 对应资产盘点接入 & LLM 兜底闲聊两条分支。这样"政策问答 → 推卡 → 结尾钩子"的闭环就能
    // 自然过渡到下一步，而不会立刻被 steward 的默认三颗快捷回复覆盖。
    policyMatch = {
      ...policyMatch,
      step: "branch_asset_audit",
      searchStatus: card.cardType === "policy_opportunity_empty" ? "failed" : "completed",
      lastSearchAt: new Date().toISOString(),
      lastResultCardId: String(card.payload?.cardId || "")
    };

    return {
      answer: [this.answerForCard(card), this.postCardClosingHook()].filter(Boolean).join("\n\n"),
      nextQuestion: "",
      card,
      policyMatch
    };
  }

  // 结尾钩子：和用户约定"以上只是泛泛查到的几条"，紧接着抛出「帮你盘牌 → 生成商业 BP → 自动申请」
  // 这条更值钱的下游路径；对应前端的「好的 / 聊点其他的」两颗快捷回复。
  private postCardClosingHook() {
    return [
      "以上这些只是我按你这一轮说的条件，泛泛查到的几条机会，还没真针对你手里的牌打磨。",
      "如果你愿意，我可以帮你把手里的资源、技能、产出先盘一遍，然后自动帮你生成一份商业 BP，并按你画像继续去申请这些政策。",
      "要不要先把手里的牌摊开让我看一眼？"
    ].join("\n\n");
  }

  private hasPolicyIntent(routeAction?: string | null, text?: string | null) {
    return this.isPolicyRouteAction(routeAction) || this.isPolicyIntentText(text);
  }

  private createInitialPolicyMatchState(): PolicyMatchState {
    const question = this.questionForStep("ask_company_status");
    return {
      flowKey: PARK_MATCH_FLOW_KEY,
      step: "ask_company_status",
      collectedSlots: {
        companyStatus: null,
        region: null,
        industry: null,
        age: null,
        revenue: null
      },
      lastQuestion: question,
      searchStatus: "idle",
      lastSearchAt: null,
      lastSearchQuery: null,
      lastResultCardId: null
    };
  }

  private parseCurrentSlot(step: PolicySlotStep, text: string):
    | { matched: true; slotKey: keyof PolicyCollectedSlots; value: NonNullable<PolicyCollectedSlots[keyof PolicyCollectedSlots]> }
    | { matched: false } {
    switch (step) {
      case "ask_company_status": {
        const value = parseCompanyStatus(text);
        return value ? { matched: true, slotKey: "companyStatus", value } : { matched: false };
      }
      case "ask_region": {
        const value = parseRegion(text);
        return value ? { matched: true, slotKey: "region", value } : { matched: false };
      }
      case "ask_industry": {
        const value = parseIndustry(text);
        return value ? { matched: true, slotKey: "industry", value } : { matched: false };
      }
      case "ask_age": {
        const value = parseAge(text);
        return value ? { matched: true, slotKey: "age", value } : { matched: false };
      }
      case "ask_revenue": {
        const value = parseRevenue(text);
        return value ? { matched: true, slotKey: "revenue", value } : { matched: false };
      }
      default:
        return { matched: false };
    }
  }

  private nextMissingStep(slots: PolicyCollectedSlots): PolicySlotStep | null {
    // 与流程图对齐：只问「是否成立公司 / 地点 / 行业 / 年龄」四个槽位，不再问收入。
    // ask_revenue 仍保留在 POLICY_SLOT_STEPS 里作为兼容态（老会话可能停在那里），
    // 但新会话不会被路由到这一问。
    if (!slots.companyStatus) return "ask_company_status";
    if (!slots.region) return "ask_region";
    if (!slots.industry) return "ask_industry";
    if (!slots.age) return "ask_age";
    return null;
  }

  private questionForStep(step: PolicySlotStep) {
    switch (step) {
      case "ask_company_status":
        return "第一个问题最关键：你现在是还没注册、个体户，还是已经有公司了？";
      case "ask_region":
        return "你现在主要在哪个城市/区域发展？";
      case "ask_industry":
        return "那你现在主要做，或者准备做，偏什么行业/方向？";
      case "ask_age":
        return "再问一个时间问题：你这件事大概做了多久了？我是想判断你是刚起步，还是已经跑过一段。";
      case "ask_revenue":
        return "最后一个，不用说太细：你现在大概处在什么收入阶段？我只是为了少给你推错政策。";
      default:
        return "";
    }
  }

  // 同一槽位反复识别不了时用的短澄清文案：不再复读首轮的铺垫语，而是直接给出示例 / 选项，
  // 让用户明白怎么回就能被识别。
  private clarifySlotQuestion(step: PolicySlotStep) {
    switch (step) {
      case "ask_company_status":
        return "一句话回我就行：「还没注册」「个体户」「有限公司」「已经有公司」—— 你是哪一个？";
      case "ask_region":
        return "直接回城市名就行，比如「杭州」「深圳」；省份也可以。";
      case "ask_industry":
        return "一句话描述你做什么的就行，比如「做私教」「卖咖啡」「写 AI 教程」。";
      case "ask_age":
        return "回个大概时间就行：「还没开始」「3 个月」「半年」「1 年」…… 挑最接近的一个。";
      case "ask_revenue":
        return "不用精确：「没收入」「月入几千」「月入 1 万」「月入 5 万以上」，挑最接近的。";
      default:
        return "";
    }
  }

  private rephraseSlotQuestion(step: PolicySlotStep) {
    if (step === "ask_company_status") {
      return "我先不急着给你甩一堆政策名词。先花一分钟把你的情况摸准，这样筛出来的机会才更像真的，不像招商广告。";
    }
    if (step === "ask_region") {
      return "政策是强地域相关的，我需要先把城市定准。";
    }
    if (step === "ask_industry") {
      return "同一个城市，不同行业能拿到的政策差别很大。";
    }
    if (step === "ask_age") {
      return "成立或经营时间会影响很多申报条件，我先确认一下。";
    }
    return "收入规模会影响政策匹配，我先确认这个槽位。";
  }

  private transitionMessage(nextStep: PolicySlotStep, parsedCurrentSlot: boolean) {
    if (!parsedCurrentSlot) {
      return "我先帮你把政策匹配需要的信息补齐。";
    }
    if (nextStep === "ask_region") {
      return "好，我先把地图钉一下。";
    }
    if (nextStep === "ask_industry") {
      return "明白。";
    }
    if (nextStep === "ask_age") {
      return "";
    }
    if (nextStep === "ask_revenue") {
      return "";
    }
    return "信息够了，我开始查政策。";
  }

  private buildSearchQuery(slots: PolicyCollectedSlots) {
    const region = formatRegion(slots.region);
    const industry = slots.industry?.label || "小微企业";
    const companyStatus = formatCompanyStatus(slots.companyStatus);
    return `${region} ${industry} ${companyStatus} 园区 入驻 政策 补贴 返税 创业扶持 官方`;
  }

  private async searchAndBuildCard(slots: PolicyCollectedSlots, query: string): Promise<PolicyOpportunityCard> {
    try {
      const searchInput: PolicySearchInput = {
        query,
        region: formatRegion(slots.region),
        industry: slots.industry?.label || "小微企业",
        companyStatus: formatCompanyStatus(slots.companyStatus),
        limit: 6,
        freshnessDays: 730
      };
      const cacheKey = `${this.provider.name}:${query}`;
      const cached = this.searchCache.get(cacheKey);
      const now = Date.now();
      let fromCache = false;
      let rawResults: PolicySearchRawResult[];
      if (cached && cached.expiresAt > now) {
        rawResults = cached.results;
        fromCache = true;
      } else {
        rawResults = await this.provider.search(searchInput);
        if (this.searchCache.size >= PolicyOpportunityService.SEARCH_CACHE_MAX_SIZE) {
          this.searchCache.clear();
        }
        this.searchCache.set(cacheKey, {
          results: rawResults,
          expiresAt: now + Math.max(1, this.config.policySearchTtlMinutes) * 60 * 1000
        });
      }
      const scored = rawResults
        .map((item, index) => this.standardizeAndScore(item, slots, index))
        .filter(Boolean) as ScoredPolicyDetail[];
      const sorted = scored.sort((a, b) => b.confidence.finalConfidence - a.confidence.finalConfidence);
      const recommended = sorted.filter((item) => item.confidence.finalConfidence >= 0.75).slice(0, 3);
      const lowConfidence = sorted.filter((item) => item.confidence.finalConfidence >= 0.45).slice(0, 3);

      if (!sorted.length) {
        return this.buildEmptyCard(slots, query);
      }

      if (!recommended.length && lowConfidence.length) {
        return this.buildLowConfidenceCard(slots, query, lowConfidence, fromCache);
      }

      const highRisk = recommended.find((item) => hasHighRisk(item.riskNotes));
      if (highRisk) {
        return this.buildHighRiskCard(slots, query, [highRisk, ...recommended.filter((item) => item.id !== highRisk.id)], fromCache);
      }

      return this.buildSuccessCard(slots, query, recommended, fromCache);
    } catch (error) {
      this.logger.warn(`policy search failed: ${error instanceof Error ? error.message : String(error)}`);
      return this.buildEmptyCard(slots, query, "实时搜索暂时不可用，我先保留你的条件，稍后可以重新查。");
    }
  }

  private standardizeAndScore(
    raw: PolicySearchRawResult,
    slots: PolicyCollectedSlots,
    index: number
  ): ScoredPolicyDetail | null {
    const title = String(raw.title || "").trim();
    const url = String(raw.url || "").trim();
    if (!title || !url) {
      return null;
    }
    const domain = safeDomain(url);
    const content = String(raw.content || raw.snippet || "").trim();
    const publishTime = raw.publishedDate || extractPublishTime(content);
    const policyType = resolvePolicyType(`${title}\n${content}`);
    const eligibility = extractSentence(content, /(适用|对象|条件|小微|初创|企业|个体|主体)/) || "适用条件需要以官方页面为准。";
    const benefit = extractSentence(content, /(补贴|扶持|奖励|返税|租金|贴息|注册地址|入驻)/) || "可能涉及园区入驻、申报辅导或创业扶持。";
    const deadline = extractSentence(content, /(截止|申报时间|受理时间|期限|202\d[-年])/);
    const riskNotes = buildRiskNotes({
      domain,
      publishTime,
      eligibility,
      benefit,
      companyStatus: slots.companyStatus
    });
    const detail: PolicyDetail = {
      title,
      source: {
        name: resolveSourceName(domain),
        url,
        domain
      },
      publishTime,
      region: slots.region || { rawText: "" },
      policyType,
      eligibility,
      benefit,
      deadline: deadline || null,
      riskNotes,
      summary: content ? truncate(content, 120) : "这是一条政策/园区机会线索，建议以官方页面进一步核验。"
    };

    return {
      ...detail,
      id: `policy_${index + 1}_${randomUUID().slice(0, 8)}`,
      confidence: this.scorePolicy(detail)
    };
  }

  private scorePolicy(detail: PolicyDetail): PolicyConfidenceScore {
    const officialSite = isOfficialDomain(detail.source.domain);
    const domainMatched = this.allowedDomains.some((domain) => detail.source.domain.endsWith(domain));
    const sourceAuthorityScore = officialSite ? 0.95 : domainMatched ? 0.85 : 0.45;
    const publishTimeScore = scorePublishTime(detail.publishTime);
    const contentCompletenessScore = scoreCompleteness(detail);
    const finalConfidence = roundScore(
      sourceAuthorityScore * 0.35 +
        (officialSite ? 1 : 0) * 0.15 +
        (domainMatched ? 1 : 0) * 0.15 +
        publishTimeScore * 0.15 +
        contentCompletenessScore * 0.2
    );

    return {
      sourceAuthorityScore: roundScore(sourceAuthorityScore),
      officialSite,
      domainMatched,
      publishTimeScore,
      contentCompletenessScore,
      finalConfidence
    };
  }

  private buildSuccessCard(
    slots: PolicyCollectedSlots,
    query: string,
    items: ScoredPolicyDetail[],
    fromCache = false
  ): PolicyOpportunityCard {
    return this.withCommonPayload({
      cardType: "policy_opportunity",
      title: "实时政策机会",
      description: "根据你当前阶段筛出来的政策/园区线索。",
      primaryText: "让一树解释",
      secondaryText: "复制来源",
      primaryAction: "ask_agent_explain",
      secondaryAction: "copy_link",
      cardStyle: "soft"
    }, slots, query, items, fromCache);
  }

  private buildEmptyCard(slots: PolicyCollectedSlots, query: string, description?: string): PolicyOpportunityCard {
    return this.withCommonPayload({
      cardType: "policy_opportunity_empty",
      title: "暂时没查到明确政策",
      description: description || "不是没有机会，可能是地区或行业描述还不够准。",
      primaryText: "换个方向查",
      secondaryText: "先盘资产",
      primaryAction: "ask_agent_explain",
      secondaryAction: "start_asset_audit",
      cardStyle: "soft"
    }, slots, query, []);
  }

  private buildLowConfidenceCard(
    slots: PolicyCollectedSlots,
    query: string,
    items: ScoredPolicyDetail[],
    fromCache = false
  ): PolicyOpportunityCard {
    return this.withCommonPayload({
      cardType: "policy_opportunity_low_confidence",
      title: "查到一些线索，但需要核验",
      description: "这些信息来源或发布时间不够稳，先别直接据此做决策。",
      primaryText: "让一树判断",
      secondaryText: "复制线索",
      primaryAction: "ask_agent_explain",
      secondaryAction: "copy_link",
      cardStyle: "soft"
    }, slots, query, items, fromCache);
  }

  private buildHighRiskCard(
    slots: PolicyCollectedSlots,
    query: string,
    items: ScoredPolicyDetail[],
    fromCache = false
  ): PolicyOpportunityCard {
    return this.withCommonPayload({
      cardType: "policy_opportunity_high_risk",
      title: "这个机会可能有坑",
      description: "政策看起来诱人，但可能有注册地址、纳税、社保、行业或留存周期要求。",
      primaryText: "帮我拆风险",
      secondaryText: "先盘资产",
      primaryAction: "ask_agent_explain",
      secondaryAction: "start_asset_audit",
      cardStyle: "soft"
    }, slots, query, items, fromCache);
  }

  private withCommonPayload(
    card: PolicyOpportunityCard,
    slots: PolicyCollectedSlots,
    query: string,
    items: ScoredPolicyDetail[],
    fromCache = false
  ): PolicyOpportunityCard {
    return {
      ...card,
      actions: [
        { type: "copy_link", label: "复制来源" },
        { type: "ask_agent_explain", label: "让一树解释" },
        { type: "start_asset_audit", label: "先盘资产" },
        { type: "save_policy_watch", label: "加入政策关注" }
      ],
      payload: {
        cardId: `policy-card-${randomUUID()}`,
        flowKey: PARK_MATCH_FLOW_KEY,
        slots,
        items,
        query,
        provider: this.provider.name,
        difyInputs: {
          flow_key: PARK_MATCH_FLOW_KEY,
          collected_slots: slots,
          policy_results: items.filter((item) => item.confidence.finalConfidence >= 0.75),
          low_confidence_results: items.filter((item) => item.confidence.finalConfidence < 0.75),
          risk_notes: Array.from(new Set(items.flatMap((item) => item.riskNotes))),
          user_query: query
        },
        generatedAt: new Date().toISOString(),
        freshness: this.provider.name === "mock" ? "mock" : fromCache ? "cached" : "live",
        disclaimer: "政策会变化，最终以官方页面和当地窗口确认为准。"
      }
    };
  }

  private answerForCard(card: PolicyOpportunityCard) {
    const prefix = "好，我大概摸清你的盘子了。我先按你的情况筛一轮，优先看官方来源、你这个阶段真有可能够得着的政策，不拿花哨宣传页糊弄你。\n\n";
    if (card.cardType === "policy_opportunity") {
      return prefix + "我先筛了几条相对靠谱的实时政策/园区线索，下面这些都有来源，别急着注册，我们先看匹不匹配。";
    }
    if (card.cardType === "policy_opportunity_low_confidence") {
      return prefix + "我查到一些线索，但可信度还不够稳，先当作待核验机会，不要直接拿来做决策。";
    }
    if (card.cardType === "policy_opportunity_high_risk") {
      return prefix + "有机会，但也有坑。我把风险点放在卡片里，你先别被补贴和返税几个字带跑。";
    }
    return prefix + "但这轮没有查到足够明确的官方政策结果，我先把条件保留下来，我们可以换城市或行业再查。";
  }
}

function isAskStep(step: PolicySlotStep) {
  return step.startsWith("ask_");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function normalizeCompanyStatus(value: unknown): PolicyCollectedSlots["companyStatus"] {
  const source = String(value || "").trim();
  if (source === "unregistered" || source === "individual" || source === "company" || source === "existing_company") {
    return source;
  }
  return null;
}

function normalizeRegion(value: unknown): PolicyCollectedSlots["region"] {
  if (!isRecord(value)) {
    return null;
  }
  const province = typeof value.province === "string" ? value.province : undefined;
  const city = typeof value.city === "string" ? value.city : undefined;
  const district = typeof value.district === "string" ? value.district : undefined;
  const rawText = typeof value.rawText === "string" ? value.rawText : undefined;
  return province || city || district || rawText ? { province, city, district, rawText } : null;
}

function normalizeIndustry(value: unknown): PolicyCollectedSlots["industry"] {
  if (!isRecord(value)) {
    return null;
  }
  const label = typeof value.label === "string" ? value.label.trim() : "";
  if (!label) {
    return null;
  }
  return {
    code: typeof value.code === "string" ? value.code : undefined,
    label,
    rawText: typeof value.rawText === "string" ? value.rawText : undefined
  };
}

function normalizeAge(value: unknown): PolicyCollectedSlots["age"] {
  if (!isRecord(value)) {
    return null;
  }
  const bucket = String(value.bucket || "");
  if (!["not_started", "lt_6m", "6m_1y", "1y_3y", "gt_3y"].includes(bucket)) {
    return null;
  }
  return {
    value: typeof value.value === "number" ? value.value : undefined,
    unit: value.unit === "month" || value.unit === "year" ? value.unit : undefined,
    bucket: bucket as NonNullable<PolicyCollectedSlots["age"]>["bucket"],
    rawText: typeof value.rawText === "string" ? value.rawText : undefined
  };
}

function normalizeRevenue(value: unknown): PolicyCollectedSlots["revenue"] {
  if (!isRecord(value)) {
    return null;
  }
  const bucket = String(value.bucket || "");
  if (!["none", "lt_10k", "10k_100k", "100k_500k", "gt_500k", "unknown"].includes(bucket)) {
    return null;
  }
  return {
    bucket: bucket as NonNullable<PolicyCollectedSlots["revenue"]>["bucket"],
    rawText: typeof value.rawText === "string" ? value.rawText : undefined
  };
}

function parseCompanyStatus(text: string): PolicyCollectedSlots["companyStatus"] {
  const source = String(text || "").trim();
  if (!source) return null;
  // 正则兜底：用户爱怎么说就怎么说。尽量覆盖"还没/没/未/准备"等否定/未开始语义，
  // 以及"注册过/注册了/开过/成立/搞过/已经有"这类已有主体的表述。
  // 个体户单独一档，公司 / 有限公司 / 企业 统一落到 company（与 existing_company 合并使用，
  // 下游 formatCompanyStatus 两者显示相同，不影响搜索 query）。
  if (/(还没|没有注册|未注册|没注册|没开|还没开|还没搞|没搞|还没成立|没成立|准备注册|打算注册|准备开|想开|unregistered)/i.test(source)) {
    return "unregistered";
  }
  if (/(个体户|个体工商户|个体|individual)/i.test(source)) {
    return "individual";
  }
  if (/(有限公司|股份公司|股份有限|公司|企业|营业执照|company)/i.test(source)) {
    return "company";
  }
  if (/(注册过|注册了|已注册|已经注册|已有|成立了|成立过|开过公司|开了公司|搞过|搞了|有主体|有执照|existing)/i.test(source)) {
    return "existing_company";
  }
  // 最后的兜底：用户说"有"/"没"这种单字，也尽量不要再追问一轮。
  if (/^没?$/.test(source) || /^没有?$/.test(source) || /^不$/.test(source)) {
    return "unregistered";
  }
  if (/^有$/.test(source) || /^有了$/.test(source)) {
    return "existing_company";
  }
  return null;
}

function parseRegion(text: string): PolicyCollectedSlots["region"] {
  const source = String(text || "").trim();
  if (!source) return null;
  // 确认词 / 填充词 / 否认词直接拒绝，避免把"好的/不知道"写进 region slot
  if (/^(好的?|ok|嗯|恩|是的?|对|懂了|明白|不知道|不清楚|随便|都行|没想好|没有|没|无)$/i.test(source)) {
    return null;
  }
  const city = CITY_HINTS.find((item) => source.includes(item));
  const province = PROVINCE_HINTS.find((item) => source.includes(item));
  if (city || province) {
    return { province, city, rawText: source };
  }
  // 兜底 1：带"我在/地区/城市/查"前缀的显式陈述
  const prefixed = source.match(/(?:我在|我人在|地区|城市|查|位于)([\u4e00-\u9fa5]{2,8}?)(?:市|省|区|县)?/);
  if (prefixed?.[1]) {
    return { city: prefixed[1], rawText: source };
  }
  // 兜底 2：任何以"市/省/区/县"结尾的中文地名（如"珠海市/浦东新区"）
  const suffixed = source.match(/([\u4e00-\u9fa5]{2,8})(市|省|区|县)/);
  if (suffixed?.[1]) {
    const name = suffixed[1];
    const isProvince = suffixed[2] === "省";
    return isProvince ? { province: name, rawText: source } : { city: name, rawText: source };
  }
  // 兜底 3：纯中文 2~6 字（如"珠海""厦门""成都高新"）也当作城市名收下
  if (/^[\u4e00-\u9fa5]{2,6}$/.test(source)) {
    return { city: source, rawText: source };
  }
  return null;
}

function parseIndustry(text: string): PolicyCollectedSlots["industry"] {
  const source = String(text || "").trim();
  if (!source || source.length < 2) {
    return null;
  }
  // 防御：确认词 / 填充词不能被当成行业名写进 slot —— 否则"好的"会被固化成行业，
  // 导致后续 ask_age / ask_revenue 的推进全乱套。
  if (/^(好的|好|ok|恩|嗯|可以|没问题|是的?|对|懂了|明白|不知道|不清楚|随便|都行|没想好|没有|没)$/i.test(source)) {
    return null;
  }
  const cleaned = source.replace(/(我做|行业是|方向是|主要做|准备做|想做|创业|项目|公司)/g, "").trim();
  if (!cleaned || cleaned.length < 2) {
    return null;
  }
  return {
    label: truncate(cleaned, 24),
    rawText: source
  };
}

// 中文数词 → 阿拉伯数字兜底表。只覆盖口语里真的常见的量级（一到十 + 两 + 半），
// 其余由阿拉伯数字兜底。用意是"一个月/两年/半年/十几年"这种自然表达也能推进 slot。
const CN_NUM: Record<string, number> = {
  "零": 0,
  "一": 1,
  "二": 2,
  "两": 2,
  "三": 3,
  "四": 4,
  "五": 5,
  "六": 6,
  "七": 7,
  "八": 8,
  "九": 9,
  "十": 10
};

function extractChineseOrArabicNumber(source: string): number | null {
  const arabic = source.match(/(\d+(?:\.\d+)?)/);
  if (arabic) {
    const value = Number(arabic[1]);
    return Number.isFinite(value) ? value : null;
  }
  // 十几 / 二十 / 十 / 一 / 两
  const tens = source.match(/([一二两三四五六七八九])?十([一二三四五六七八九])?/);
  if (tens) {
    const left = tens[1] ? CN_NUM[tens[1]] : 1;
    const right = tens[2] ? CN_NUM[tens[2]] : 0;
    return left * 10 + right;
  }
  const single = source.match(/([零一二两三四五六七八九])/);
  if (single) {
    return CN_NUM[single[1]] ?? null;
  }
  return null;
}

function parseAge(text: string): PolicyCollectedSlots["age"] {
  const source = String(text || "").trim();
  if (!source) return null;
  // 未开始 / 还没做 —— 宽松匹配，哪怕是"暂时没开始"也算。
  if (/(还没|未开始|刚准备|没有开始|没开始|没做过|还没做|没动|暂时没|0\s*(个月|月|年)?)/.test(source)) {
    return { bucket: "not_started", rawText: source };
  }
  // 半年 / 大半年
  if (/半年/.test(source)) {
    return { value: 6, unit: "month", bucket: "6m_1y", rawText: source };
  }
  // 月份：阿拉伯 or 中文数词，都收
  if (/月/.test(source)) {
    const value = extractChineseOrArabicNumber(source);
    if (value !== null) {
      return {
        value,
        unit: "month",
        bucket: value < 6 ? "lt_6m" : value < 12 ? "6m_1y" : "1y_3y",
        rawText: source
      };
    }
  }
  // 年份：阿拉伯 or 中文数词，都收
  if (/年/.test(source)) {
    const value = extractChineseOrArabicNumber(source);
    if (value !== null) {
      return {
        value,
        unit: "year",
        bucket: value < 1 ? "6m_1y" : value <= 3 ? "1y_3y" : "gt_3y",
        rawText: source
      };
    }
  }
  // 起步 / 刚做 / 新手 —— 按 <6 个月算
  if (/(刚开始|刚做|起步|刚起步|新手|入门|才做|刚接触)/.test(source)) {
    return { bucket: "lt_6m", rawText: source };
  }
  // 老玩家 / 很多年 / 好几年 —— 按 >3 年算
  if (/(很多年|好多年|好几年|多年|老玩家|老手)/.test(source)) {
    return { bucket: "gt_3y", rawText: source };
  }
  return null;
}

function parseRevenue(text: string): PolicyCollectedSlots["revenue"] {
  const source = String(text || "").trim();
  if (/(没有|暂无|0|没收入|无收入)/.test(source)) {
    return { bucket: "none", rawText: source };
  }
  if (/(不知道|不确定|保密|说不准)/.test(source)) {
    return { bucket: "unknown", rawText: source };
  }
  const amount = source.match(/(\d+(?:\.\d+)?)\s*(万|k|K)?/);
  if (!amount) {
    return null;
  }
  const numeric = Number(amount[1]);
  const yuan = amount[2] === "万" ? numeric * 10000 : /k/i.test(String(amount[2] || "")) ? numeric * 1000 : numeric;
  if (yuan < 10000) return { bucket: "lt_10k", rawText: source };
  if (yuan < 100000) return { bucket: "10k_100k", rawText: source };
  if (yuan < 500000) return { bucket: "100k_500k", rawText: source };
  return { bucket: "gt_500k", rawText: source };
}

function formatRegion(region: PolicyCollectedSlots["region"]) {
  if (!region) return "本地";
  return region.district || region.city || region.province || region.rawText || "本地";
}

function formatCompanyStatus(value: PolicyCollectedSlots["companyStatus"]) {
  switch (value) {
    case "unregistered":
      return "未注册主体";
    case "individual":
      return "个体户";
    case "company":
      return "有限公司";
    case "existing_company":
      return "已有公司";
    default:
      return "创业主体";
  }
}

function safeDomain(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch (_error) {
    return "";
  }
}

function isOfficialDomain(domain: string) {
  return /(^|\.)(gov\.cn|zwfw\.gov\.cn|tax\.gov\.cn)$/.test(domain) || /(政府|政务|税务|工信|人社)/.test(domain);
}

function resolveSourceName(domain: string) {
  if (!domain) return "未知来源";
  if (domain.endsWith("gov.cn")) return "政府/政务官网";
  if (domain.endsWith("tax.gov.cn")) return "税务官网";
  if (domain.endsWith("zwfw.gov.cn")) return "政务服务网";
  return domain;
}

function extractPublishTime(content: string) {
  const matched = String(content || "").match(/20\d{2}[-年/.](0?[1-9]|1[0-2])[-月/.](0?[1-9]|[12]\d|3[01])?/);
  return matched ? matched[0].replace(/[年月/.]/g, "-").replace(/-$/, "") : null;
}

function resolvePolicyType(text: string): PolicyType {
  const matched = POLICY_TYPE_KEYWORDS.find((item) => item.re.test(text));
  return matched?.type || "other";
}

function extractSentence(content: string, re: RegExp) {
  const sentences = String(content || "")
    .split(/[。；;\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
  const matched = sentences.find((sentence) => re.test(sentence));
  return matched ? truncate(matched, 120) : "";
}

function buildRiskNotes(input: {
  domain: string;
  publishTime: string | null;
  eligibility: string;
  benefit: string;
  companyStatus: PolicyCollectedSlots["companyStatus"];
}) {
  const notes: string[] = [];
  if (!isOfficialDomain(input.domain)) {
    notes.push("来源不是明确官方域名，需要二次核验。");
  }
  if (!input.publishTime) {
    notes.push("未识别到发布时间，需确认政策是否仍有效。");
  }
  if (/(注册地址|入驻|园区)/.test(`${input.eligibility}${input.benefit}`)) {
    notes.push("需核验注册地址、入驻期限和迁出限制。");
  }
  if (/(纳税|返税|税收)/.test(`${input.eligibility}${input.benefit}`)) {
    notes.push("需核验纳税留存、开票规模和返还周期。");
  }
  if (/(社保|员工|人数)/.test(`${input.eligibility}${input.benefit}`)) {
    notes.push("需核验社保人数和劳动关系要求。");
  }
  if (input.companyStatus === "unregistered") {
    notes.push("你还未注册主体，先确认政策是否值得为了它注册。");
  }
  return notes.length ? notes : ["政策条件可能变化，最终以官方窗口确认为准。"];
}

function scorePublishTime(value: string | null) {
  if (!value) return 0.45;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return 0.5;
  const days = (Date.now() - parsed) / 86400000;
  if (days <= 180) return 0.95;
  if (days <= 730) return 0.72;
  return 0.35;
}

function scoreCompleteness(detail: PolicyDetail) {
  const parts = [
    !!detail.title,
    !!detail.source.url,
    !!detail.publishTime,
    !!detail.region.rawText || !!detail.region.city || !!detail.region.province,
    !!detail.eligibility,
    !!detail.benefit,
    !!detail.deadline,
    detail.riskNotes.length > 0
  ];
  return roundScore(parts.filter(Boolean).length / parts.length);
}

function hasHighRisk(notes: string[]) {
  const text = notes.join("\n");
  return /(注册地址|纳税|返还周期|社保|入驻期限|迁出限制)/.test(text);
}

function roundScore(value: number) {
  return Math.max(0, Math.min(1, Number(value.toFixed(2))));
}

function truncate(value: string, max: number) {
  const text = String(value || "").trim();
  return text.length > max ? `${text.slice(0, max)}...` : text;
}
