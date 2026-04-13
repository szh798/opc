const CARD_LOCALIZATION_BY_TYPE = {
  asset_radar: {
    title: "资产雷达",
    description: "盘点技能、资源和杠杆点，明确下一步发力方向。",
    primaryText: "打开",
    secondaryText: "稍后"
  },
  opportunity_score: {
    title: "机会评分",
    description: "按需求、投入和回报周期评估优先级。",
    primaryText: "打开",
    secondaryText: "稍后"
  },
  business_health: {
    title: "生意体检",
    description: "检查收入质量、现金流与可复用性。",
    primaryText: "打开",
    secondaryText: "稍后"
  },
  pricing_card: {
    title: "定价卡",
    description: "搭建清晰且有说服力的定价结构。",
    primaryText: "打开",
    secondaryText: "稍后"
  },
  park_match: {
    title: "园区匹配",
    description: "根据你的画像匹配政策友好型园区。",
    primaryText: "打开",
    secondaryText: "稍后"
  },
  action_plan_48h: {
    title: "48小时行动计划",
    description: "生成未来48小时可执行的关键动作。",
    primaryText: "打开",
    secondaryText: "稍后"
  },
  asset_report: {
    title: "资产盘点报告",
    description: "报告已生成，可直接查看并继续推进。",
    primaryText: "查看报告",
    secondaryText: "稍后"
  },
  dimension_report: {
    title: "维度小报告",
    description: "该维度盘点已完成，继续推进下一步。",
    primaryText: "继续",
    secondaryText: "稍后"
  },
  artifact_card: {
    title: "阶段卡片",
    description: "当前阶段的结构化结果已生成。",
    primaryText: "继续",
    secondaryText: ""
  }
};

const EN_ZH_TEXT_MAP = {
  "stage card": "阶段卡片",
  "structured output has been generated for this step.": "当前阶段的结构化结果已生成。",
  "asset radar": "资产雷达",
  "map skills, assets, and leverage points for your next move.": "盘点技能、资源和杠杆点，明确下一步发力方向。",
  "opportunity score": "机会评分",
  "score options by demand, effort, and payback cycle.": "按需求、投入和回报周期评估优先级。",
  "business health": "生意体检",
  "review revenue quality, cash flow, and repeatability.": "检查收入质量、现金流与可复用性。",
  "pricing card": "定价卡",
  "build a clear and defensible pricing structure.": "搭建清晰且有说服力的定价结构。",
  "park match": "园区匹配",
  "match your profile to policy-friendly business parks.": "根据你的画像匹配政策友好型园区。",
  "48h action plan": "48小时行动计划",
  "generate actionable steps for the next 48 hours.": "生成未来48小时可执行的关键动作。",
  "asset report": "资产盘点报告",
  "open report": "查看报告",
  open: "打开",
  later: "稍后"
};

function hasChinese(text = "") {
  return /[\u4e00-\u9fff]/.test(String(text || ""));
}

function normalizeText(rawText, fallbackText = "") {
  const source = String(rawText || "").trim();
  if (!source) {
    return String(fallbackText || "");
  }

  if (hasChinese(source)) {
    return source;
  }

  const mapped = EN_ZH_TEXT_MAP[source.toLowerCase()];
  if (mapped) {
    return mapped;
  }

  return source;
}

function normalizeCardPayload(card = {}) {
  if (!card || typeof card !== "object") {
    return null;
  }

  const type = card.cardType || card.type || "artifact_card";
  const localized = CARD_LOCALIZATION_BY_TYPE[type] || CARD_LOCALIZATION_BY_TYPE.artifact_card;

  return {
    id: `card-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    type: "artifact_card",
    cardType: type,
    title: normalizeText(card.title, localized.title),
    description: normalizeText(card.description, localized.description),
    primaryText: normalizeText(card.primaryText, localized.primaryText),
    secondaryText: normalizeText(card.secondaryText, localized.secondaryText),
    tags: Array.isArray(card.tags) ? card.tags : [],
    meta: normalizeText(card.meta, ""),
    primaryAction: card.primaryAction ? String(card.primaryAction) : "",
    secondaryAction: card.secondaryAction ? String(card.secondaryAction) : "",
    cardStyle: card.cardStyle ? String(card.cardStyle) : "default"
  };
}

function cardsToMessages(cards = []) {
  if (!Array.isArray(cards)) {
    return [];
  }

  return cards.map((item) => normalizeCardPayload(item)).filter(Boolean);
}

module.exports = {
  normalizeCardPayload,
  cardsToMessages
};
