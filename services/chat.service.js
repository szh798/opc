const { get, post, remove } = require("./request");
const { requestData } = require("./service-utils");

const CHAT_REQUEST_TIMEOUT_MS = 310000;

const CHAT_STREAM_EVENT_TYPES = {
  META: "meta",
  TOKEN: "token",
  MESSAGE: "message",
  DONE: "done",
  ERROR: "error",
  HEARTBEAT: "heartbeat"
};

function normalizeStreamStart(raw = {}, payload = {}) {
  const normalized = raw && typeof raw === "object" ? raw : {};
  const streamId = normalized.streamId || normalized.stream_id || normalized.id || "";
  const conversationId =
    normalized.conversationId ||
    normalized.conversation_id ||
    payload.conversationId ||
    "";

  return {
    ...normalized,
    streamId,
    conversationId,
    status: normalized.status || (streamId ? "streaming" : "pending")
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

    if (raw.data && typeof raw.data === "object" && Array.isArray(raw.data.events)) {
      return raw.data.events;
    }
  }

  return [];
}

function normalizeConversationDetail(raw = {}) {
  const payload = raw && typeof raw === "object" ? raw : {};
  const messages = Array.isArray(payload.messages) ? payload.messages : [];
  return {
    id: payload.id || payload.conversationId || "",
    conversationId: payload.conversationId || payload.id || "",
    sceneKey: payload.sceneKey || "",
    label: payload.label || "",
    updatedAt: payload.updatedAt || "",
    messages: messages
      .filter((item) => item && typeof item === "object")
      .map((item) => ({
        id: item.id || "",
        type: item.type === "user" ? "user" : "agent",
        text: item.text || "",
        agentKey: item.agentKey || "",
        createdAt: item.createdAt || ""
      }))
  };
}

async function fetchConversationScene(sceneKey = "home") {
  return requestData(
    () => get(`/chat/scenes/${sceneKey}`),
    "获取对话场景失败"
  );
}

async function fetchConversationSceneRemote(sceneKey = "home") {
  return requestData(
    () => get(`/chat/scenes/${sceneKey}`),
    "获取对话场景失败"
  );
}

async function sendChatMessage(payload = {}) {
  return requestData(
    () => post("/chat/messages", payload, {
      timeout: CHAT_REQUEST_TIMEOUT_MS
    }),
    "发送消息失败"
  );
}

async function startChatStream(payload = {}) {
  const raw = await requestData(
    () => post("/chat/stream/start", payload, {
      timeout: CHAT_REQUEST_TIMEOUT_MS
    }),
    "启动流式回复失败"
  );

  return normalizeStreamStart(raw, payload);
}

async function pollChatStream(streamId) {
  if (!streamId) {
    return [];
  }

  const raw = await requestData(
    () => get(`/chat/stream/${streamId}`),
    "获取流式回复失败"
  );

  return normalizeStreamChunk(raw);
}

async function fetchConversationHistory(conversationId = "") {
  const targetId = String(conversationId || "").trim();
  if (!targetId) {
    throw new Error("recent_chat_id_required");
  }

  const raw = await requestData(
    () => get(`/conversations/${encodeURIComponent(targetId)}`),
    "加载历史对话失败"
  );

  return normalizeConversationDetail(raw);
}

async function deleteRecentChat(conversationId = "") {
  const targetId = String(conversationId || "").trim();
  if (!targetId) {
    throw new Error("recent_chat_id_required");
  }

  return requestData(
    () => remove(`/conversations/${encodeURIComponent(targetId)}`),
    "删除最近聊天失败"
  );
}

async function clearRecentChats() {
  return requestData(
    () => remove("/conversations"),
    "清空最近聊天失败"
  );
}

function foldStreamEvents(events = []) {
  return events.reduce(
    (acc, event) => {
      if (!event || typeof event !== "object") {
        return acc;
      }

      if (event.type === CHAT_STREAM_EVENT_TYPES.TOKEN) {
        acc.content += event.token || event.delta || event.content || "";
      }

      if (event.type === CHAT_STREAM_EVENT_TYPES.MESSAGE && event.message) {
        acc.content = event.message.text || event.message.content || acc.content;
      }

      if (event.type === CHAT_STREAM_EVENT_TYPES.DONE) {
        acc.done = true;
        acc.usage = event.usage || null;
      }

      if (event.type === CHAT_STREAM_EVENT_TYPES.ERROR) {
        acc.done = true;
        acc.error = event.message || "stream_error";
      }

      return acc;
    },
    {
      content: "",
      done: false,
      error: "",
      usage: null
    }
  );
}

module.exports = {
  CHAT_STREAM_EVENT_TYPES,
  fetchConversationScene,
  fetchConversationSceneRemote,
  sendChatMessage,
  startChatStream,
  pollChatStream,
  fetchConversationHistory,
  deleteRecentChat,
  clearRecentChats,
  foldStreamEvents
};
