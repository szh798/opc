const { get, post } = require("./request");
const { requestData } = require("./service-utils");

const ROUTER_STREAM_EVENT_TYPES = {
  META: "meta",
  TOKEN: "token",
  CARD: "card",
  DONE: "done",
  ERROR: "error"
};

function normalizeSessionPayload(raw = {}) {
  const payload = raw && typeof raw === "object" ? raw : {};
  return {
    ...payload,
    sessionId: payload.sessionId || payload.conversationStateId || "",
    conversationStateId: payload.conversationStateId || payload.sessionId || "",
    activeChatflowId: payload.activeChatflowId || payload.chatflowId || "",
    chatflowId: payload.chatflowId || payload.activeChatflowId || "",
    routeMode: payload.routeMode || "guided",
    quickReplies: Array.isArray(payload.quickReplies) ? payload.quickReplies : [],
    firstScreenMessages: Array.isArray(payload.firstScreenMessages) ? payload.firstScreenMessages : [],
    recentMessages: Array.isArray(payload.recentMessages) ? payload.recentMessages : []
  };
}

function normalizeStreamStart(raw = {}, sessionId = "") {
  const payload = raw && typeof raw === "object" ? raw : {};
  return {
    ...payload,
    streamId: payload.streamId || payload.id || "",
    sessionId: payload.sessionId || payload.conversationStateId || sessionId || "",
    conversationStateId: payload.conversationStateId || payload.sessionId || sessionId || "",
    routeMode: payload.routeMode || "guided",
    activeChatflowId: payload.activeChatflowId || payload.chatflowId || "",
    chatflowId: payload.chatflowId || payload.activeChatflowId || ""
  };
}

function normalizeStreamChunk(raw) {
  if (Array.isArray(raw)) {
    return raw;
  }

  if (raw && typeof raw === "object") {
    if (Array.isArray(raw.events)) {
      return raw.events;
    }

    if (raw.event && typeof raw.event === "object") {
      return [raw.event];
    }
  }

  return [];
}

async function createRouterSession(payload = {}) {
  const data = await requestData(
    () => post("/router/sessions", payload),
    "创建路由会话失败"
  );
  return normalizeSessionPayload(data);
}

async function fetchRouterSession(sessionId) {
  const data = await requestData(
    () => get(`/router/sessions/${sessionId}`),
    "获取路由会话失败"
  );
  return normalizeSessionPayload(data);
}

async function startRouterStream(sessionId, input = {}) {
  const data = await requestData(
    () => post(`/router/sessions/${sessionId}/stream/start`, { input }),
    "启动路由流失败"
  );
  return normalizeStreamStart(data, sessionId);
}

async function pollRouterStream(streamId) {
  if (!streamId) {
    return [];
  }

  const data = await requestData(
    () => get(`/router/streams/${streamId}`),
    "获取路由流失败"
  );
  return normalizeStreamChunk(data);
}

async function switchRouterAgent(sessionId, payload = {}) {
  const data = await requestData(
    () => post(`/router/sessions/${sessionId}/agent-switch`, payload),
    "角色切换失败"
  );
  return normalizeSessionPayload(data);
}

async function submitRouterQuickReply(sessionId, payload = {}) {
  const data = await requestData(
    () => post(`/router/sessions/${sessionId}/quick-reply`, payload),
    "快捷回复提交失败"
  );
  return normalizeStreamStart(data, sessionId);
}

async function previewMemoryInjection(sessionId) {
  return requestData(
    () => post(`/router/sessions/${sessionId}/memory/inject-preview`, {}),
    "记忆注入预览失败"
  );
}

function foldRouterStreamEvents(events = []) {
  return events.reduce((acc, event) => {
    if (!event || typeof event !== "object") {
      return acc;
    }

    if (event.type === ROUTER_STREAM_EVENT_TYPES.TOKEN) {
      acc.content += event.token || event.delta || event.content || "";
    }

    if (event.type === ROUTER_STREAM_EVENT_TYPES.CARD && event.card) {
      acc.cards.push(event.card);
    }

    if (event.type === ROUTER_STREAM_EVENT_TYPES.META) {
      acc.meta = event;
    }

    if (event.type === ROUTER_STREAM_EVENT_TYPES.DONE) {
      acc.done = true;
      acc.usage = event.usage || null;
    }

    if (event.type === ROUTER_STREAM_EVENT_TYPES.ERROR) {
      acc.done = true;
      acc.error = event.message || "stream_error";
    }

    return acc;
  }, {
    content: "",
    cards: [],
    meta: null,
    done: false,
    error: "",
    usage: null
  });
}

module.exports = {
  ROUTER_STREAM_EVENT_TYPES,
  createRouterSession,
  fetchRouterSession,
  startRouterStream,
  pollRouterStream,
  switchRouterAgent,
  submitRouterQuickReply,
  previewMemoryInjection,
  foldRouterStreamEvents
};
