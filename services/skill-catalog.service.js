const SKILL_CATALOG = [
  {
    key: "brand_voice",
    title: "Brand Voice / 文风",
    description: "沉淀你的个人语气，生成朋友圈、小红书和触达话术。",
    routeAction: "skill_brand_voice",
    accentColor: "#534AB7"
  },
  {
    key: "offer_positioning",
    title: "Offer Positioning / 产品定位",
    description: "把你能做什么，包装成别人为什么买。",
    routeAction: "skill_offer_positioning",
    accentColor: "#10A37F"
  },
  {
    key: "customer_persona",
    title: "Customer Persona / 客户画像",
    description: "收敛第一批客户，避免泛泛地卖给所有人。",
    routeAction: "skill_customer_persona",
    accentColor: "#378ADD"
  },
  {
    key: "pricing_page",
    title: "Pricing Page / 定价文案",
    description: "生成三层定价、报价说明和服务套餐。",
    routeAction: "skill_pricing_page",
    accentColor: "#EBA327"
  },
  {
    key: "partnership_outreach",
    title: "Partnership / Outreach 触达",
    description: "生成找客户、找合作、熟人开口和报价跟进话术。",
    routeAction: "skill_partnership_outreach",
    accentColor: "#E24B4A"
  },
  {
    key: "landing_page_copy",
    title: "Landing Page Copy / 落地页文案",
    description: "把服务变成能发出去的介绍页、长文或海报文案。",
    routeAction: "skill_landing_page_copy",
    accentColor: "#0D0D0D"
  },
  {
    key: "market_research",
    title: "Market Research / 市场调研",
    description: "基于材料验证方向、竞品话术和用户痛点。",
    routeAction: "skill_market_research",
    accentColor: "#2B7A78"
  },
  {
    key: "survey_question",
    title: "Survey Question / 用户访谈问题",
    description: "生成 5-8 个 Mom Test 风格访谈问题。",
    routeAction: "skill_survey_question",
    accentColor: "#8B5CF6"
  }
];

function getSkillCatalog() {
  return SKILL_CATALOG.map((item) => ({ ...item }));
}

function findSkillByKey(key) {
  const normalized = String(key || "").trim();
  return getSkillCatalog().find((item) => item.key === normalized) || null;
}

module.exports = {
  getSkillCatalog,
  findSkillByKey
};
