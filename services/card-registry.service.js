function normalizeCardPayload(card = {}) {
  if (!card || typeof card !== "object") {
    return null;
  }

  const type = card.cardType || card.type || "artifact_card";
  const base = {
    id: `card-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    type: "artifact_card",
    title: card.title || "阶段卡片",
    description: card.description || "",
    primaryText: card.primaryText || "继续",
    secondaryText: card.secondaryText || "",
    tags: Array.isArray(card.tags) ? card.tags : []
  };

  switch (type) {
    case "asset_radar":
    case "opportunity_score":
    case "business_health":
    case "pricing_card":
    case "park_match":
    case "action_plan_48h":
      return {
        ...base,
        cardType: type
      };
    default:
      return {
        ...base,
        cardType: type
      };
  }
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
