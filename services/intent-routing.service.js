const TOOL_SCENE_MAP = {
  ai: "ai_assistant",
  ip: "ip_assistant"
};

const RECENT_SCENE_MAP = {
  "recent-1": "home",
  "recent-2": "milestone_unlocked",
  "recent-3": "monthly_check",
  "recent-4": "weekly_report"
};

function resolveToolScene(toolKey, guideSeen) {
  if (toolKey === "company") {
    return {
      type: "panel",
      panel: "company"
    };
  }

  if (!guideSeen && (toolKey === "ai" || toolKey === "ip")) {
    return {
      type: "scene",
      scene: "leverage_intro",
      target: toolKey
    };
  }

  return {
    type: "scene",
    scene: TOOL_SCENE_MAP[toolKey] || "home",
    target: toolKey
  };
}

function resolveRecentScene(recentId) {
  return RECENT_SCENE_MAP[recentId] || "home";
}

module.exports = {
  resolveToolScene,
  resolveRecentScene
};
