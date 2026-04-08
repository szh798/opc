const DEFAULT_STATE = {
  currentAgentId: "master",
  routeMode: "guided",
  activeChatflowId: "",
  conversationStateId: "",
  pendingQuickReplyAction: ""
};

function createConversationState(seed = {}) {
  return {
    ...DEFAULT_STATE,
    ...seed
  };
}

function mergeConversationState(state = DEFAULT_STATE, patch = {}) {
  return {
    ...state,
    ...(patch || {})
  };
}

function bindStateFromRouterSession(state = DEFAULT_STATE, session = {}) {
  const payload = session && typeof session === "object" ? session : {};
  return mergeConversationState(state, {
    currentAgentId: payload.agentKey || state.currentAgentId || DEFAULT_STATE.currentAgentId,
    routeMode: payload.routeMode || state.routeMode || DEFAULT_STATE.routeMode,
    activeChatflowId: payload.activeChatflowId || payload.chatflowId || state.activeChatflowId || "",
    conversationStateId: payload.conversationStateId || payload.sessionId || state.conversationStateId || ""
  });
}

function buildQuickReplyPayload(item = {}) {
  const source = item && typeof item === "object" ? item : {};
  return {
    quickReplyId: source.quickReplyId || "",
    routeAction: source.routeAction || source.action || "",
    metadata: {
      quickReplyLabel: source.label || "",
      source: "mini_program_quick_reply"
    }
  };
}

module.exports = {
  DEFAULT_STATE,
  createConversationState,
  mergeConversationState,
  bindStateFromRouterSession,
  buildQuickReplyPayload
};
