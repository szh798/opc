export type RouterSkillDefinition = {
  key: string;
  title: string;
  routeAction: string;
  methodology: string;
};

export const SKILL_EXECUTOR_CHATFLOW_ID = "cf_skill_executor";
export const SKILL_DONE_MARKER = "[SKILL_DONE]";

export const ROUTER_SKILLS: RouterSkillDefinition[] = [
  {
    key: "brand_voice",
    title: "Brand Voice / 文风",
    routeAction: "skill_brand_voice",
    methodology:
      "要求用户提供 3-5 段自己写过的话。先提炼语气、词汇、句式、禁用表达和适用场景，再生成朋友圈、小红书、触达话术示例。样本不足时先追问，不要凭空定义用户风格。"
  },
  {
    key: "offer_positioning",
    title: "Offer Positioning / 产品定位",
    routeAction: "skill_offer_positioning",
    methodology:
      "把用户的能力、资产和经验转成别人愿意购买的结果。输出目标客户、核心痛点、可购买结果、差异化理由、初始 offer 和下一步验证动作。"
  },
  {
    key: "customer_persona",
    title: "Customer Persona / 客户画像",
    routeAction: "skill_customer_persona",
    methodology:
      "帮助用户收敛第一批客户。必须具体到身份、场景、预算、痛点、触达路径和排除对象；禁止泛泛写所有创业者、所有老板、所有职场人。"
  },
  {
    key: "pricing_page",
    title: "Pricing Page / 定价文案",
    routeAction: "skill_pricing_page",
    methodology:
      "生成三层定价、报价说明、服务套餐边界、交付物、风险逆转和常见异议回应。信息不足时先问预算、交付周期、结果承诺和服务边界。"
  },
  {
    key: "partnership_outreach",
    title: "Partnership / Outreach 触达",
    routeAction: "skill_partnership_outreach",
    methodology:
      "生成找客户、找合作、熟人开口和报价跟进话术。优先短、具体、低压力、有下一步选项；避免油腻销售腔和大段自夸。"
  },
  {
    key: "landing_page_copy",
    title: "Landing Page Copy / 落地页文案",
    routeAction: "skill_landing_page_copy",
    methodology:
      "把服务变成可以发出去的介绍页、长文或海报文案。默认结构包含标题、对象、痛点、结果、服务内容、案例证据、价格/行动入口。"
  },
  {
    key: "market_research",
    title: "Market Research / 市场调研",
    routeAction: "skill_market_research",
    methodology:
      "基于用户提供的材料验证方向、竞品话术和用户痛点。资料不足时必须明确假设或先追问；不要编造市场数据、竞品事实或政策事实。"
  },
  {
    key: "survey_question",
    title: "Survey Question / 用户访谈问题",
    routeAction: "skill_survey_question",
    methodology:
      "生成 5-8 个 Mom Test 风格访谈问题，用真实行为验证需求。问题应避免诱导、避免问意愿自评，优先问过去行为、替代方案、付费记录和具体损失。"
  }
];

const ROUTER_SKILL_BY_ROUTE_ACTION = new Map(ROUTER_SKILLS.map((item) => [item.routeAction, item]));
const ROUTER_SKILL_BY_KEY = new Map(ROUTER_SKILLS.map((item) => [item.key, item]));

export function resolveSkillByRouteAction(routeAction?: string | null): RouterSkillDefinition | null {
  const normalized = String(routeAction || "").trim();
  return ROUTER_SKILL_BY_ROUTE_ACTION.get(normalized) || null;
}

export function resolveSkillByKey(key?: string | null): RouterSkillDefinition | null {
  const normalized = String(key || "").trim();
  return ROUTER_SKILL_BY_KEY.get(normalized) || null;
}

export function isSkillRouteAction(routeAction?: string | null): boolean {
  return !!resolveSkillByRouteAction(routeAction);
}
