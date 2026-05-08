const SKILL_CATALOG = [
  {
    key: "brand_voice",
    title: "文风",
    description: "沉淀你的个人语气，生成朋友圈、小红书和触达话术。",
    inputPlaceholder: "贴 3-5 段你以前写过的话，我来提炼你的文风。",
    routeAction: "skill_brand_voice",
    executionMode: "multi_turn_dify_chatflow",
    executor: "dify_chatflow",
    accentColor: "#534AB7"
  },
  {
    key: "offer_positioning",
    title: "产品定位",
    description: "把你能做什么，包装成别人为什么买。",
    inputPlaceholder: "说说你能提供什么、想卖给谁，我来包装成 offer。",
    routeAction: "skill_offer_positioning",
    accentColor: "#10A37F"
  },
  {
    key: "customer_persona",
    title: "客户画像",
    description: "收敛第一批客户，避免泛泛地卖给所有人。",
    inputPlaceholder: "描述你的服务和可能客户，我来收敛第一批人群。",
    routeAction: "skill_customer_persona",
    accentColor: "#378ADD"
  },
  {
    key: "pricing_page",
    title: "定价文案",
    description: "生成三层定价、报价说明和服务套餐。",
    inputPlaceholder: "告诉我服务内容、交付周期和价格想法，我来设计套餐。",
    routeAction: "skill_pricing_page",
    accentColor: "#EBA327"
  },
  {
    key: "partnership_outreach",
    title: "触达",
    description: "生成找客户、找合作、熟人开口和报价跟进话术。",
    inputPlaceholder: "告诉我要触达谁、目的是什么，我来写开口话术。",
    routeAction: "skill_partnership_outreach",
    accentColor: "#E24B4A"
  },
  {
    key: "landing_page_copy",
    title: "落地页文案",
    description: "把服务变成能发出去的介绍页、长文或海报文案。",
    inputPlaceholder: "说说你的服务、对象和结果，我来写可发出去的文案。",
    routeAction: "skill_landing_page_copy",
    accentColor: "#0D0D0D"
  },
  {
    key: "market_research",
    title: "市场调研",
    description: "基于材料验证方向、竞品话术和用户痛点。",
    inputPlaceholder: "贴材料、竞品或你的假设，我来帮你做市场判断。",
    routeAction: "skill_market_research",
    accentColor: "#2B7A78"
  },
  {
    key: "survey_question",
    title: "用户访谈问题",
    description: "生成 5-8 个 Mom Test 风格访谈问题。",
    inputPlaceholder: "告诉我你想验证的方向，我来设计访谈问题。",
    routeAction: "skill_survey_question",
    accentColor: "#8B5CF6"
  }
];

function getSkillCatalog() {
  return SKILL_CATALOG.map((item) => ({
    executionMode: "one_turn_current_router",
    executor: "current_router",
    ...item
  }));
}

function findSkillByKey(key) {
  const normalized = String(key || "").trim();
  return getSkillCatalog().find((item) => item.key === normalized) || null;
}

module.exports = {
  getSkillCatalog,
  findSkillByKey
};
