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
  policy_opportunity: {
    title: "实时政策机会",
    description: "根据你当前阶段筛出来的政策/园区线索。",
    primaryText: "让一树解释",
    secondaryText: "复制来源"
  },
  policy_opportunity_empty: {
    title: "暂时没查到明确政策",
    description: "不是没有机会，可能是地区或行业描述还不够准。",
    primaryText: "换个方向查",
    secondaryText: "先盘资产"
  },
  policy_opportunity_low_confidence: {
    title: "查到一些线索，但需要核验",
    description: "这些信息来源或发布时间不够稳，先别直接据此做决策。",
    primaryText: "让一树判断",
    secondaryText: "复制线索"
  },
  policy_opportunity_high_risk: {
    title: "这个机会可能有坑",
    description: "政策看起来诱人，但可能有注册地址、纳税、社保、行业或留存周期要求。",
    primaryText: "帮我拆风险",
    secondaryText: "先盘资产"
  },
  policy_flow_switch_confirm: {
    title: "要先切去查政策吗？",
    description: "你现在还在当前流程里。要先暂停它，切去查政策/园区机会吗？",
    primaryText: "切去查政策",
    secondaryText: "继续当前流程"
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
  "policy opportunity": "实时政策机会",
  "real-time policy opportunities": "实时政策机会",
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
  if (type === "asset_report_progress" || card.card_type === "asset_report_progress") {
    return {
      id: card.cardId || card.card_id || `card-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      type: "asset_report_progress",
      cardId: card.cardId || card.card_id || "",
      cardType: "asset_report_progress",
      data: card.data || card.payload || card
    };
  }
  const localized = CARD_LOCALIZATION_BY_TYPE[type] || CARD_LOCALIZATION_BY_TYPE.artifact_card;
  const isPolicyCard = /^policy_/.test(type);

  return {
    id: `card-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    type: isPolicyCard ? "policy_opportunity_card" : "artifact_card",
    cardType: type,
    title: normalizeText(card.title, localized.title),
    description: normalizeText(card.description, localized.description),
    primaryText: normalizeText(card.primaryText, localized.primaryText),
    secondaryText: normalizeText(card.secondaryText, localized.secondaryText),
    tags: Array.isArray(card.tags) ? card.tags : [],
    meta: normalizeText(card.meta, ""),
    primaryAction: card.primaryAction ? String(card.primaryAction) : "",
    secondaryAction: card.secondaryAction ? String(card.secondaryAction) : "",
    cardStyle: card.cardStyle ? String(card.cardStyle) : "default",
    payload: card.payload && typeof card.payload === "object" ? card.payload : {},
    actions: Array.isArray(card.actions) ? card.actions : []
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
