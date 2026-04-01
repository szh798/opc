const { get, post } = require("./request");
const { conversations } = require("../mock/chat");
const { clone, requestWithFallback } = require("./service-utils");
const { getAgentMeta } = require("../theme/roles");

const CHAT_REQUEST_TIMEOUT_MS = 120000;

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
    "mock-conversation";

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

function getConversationScene(sceneKey) {
  const scene = clone(conversations[sceneKey] || conversations.home);

  return {
    ...scene,
    agent: getAgentMeta(scene.agentKey)
  };
}

async function fetchConversationScene(sceneKey = "home") {
  return requestWithFallback(
    () => get(`/chat/scenes/${sceneKey}`),
    getConversationScene(sceneKey)
  );
}

async function fetchConversationSceneRemote(sceneKey = "home") {
  const response = await get(`/chat/scenes/${sceneKey}`);

  if (response && response.ok && response.data) {
    return response.data;
  }

  throw new Error((response && response.message) || "fetch_scene_failed");
}

async function sendChatMessage(payload = {}) {
  return requestWithFallback(
    () => post("/chat/messages", payload, {
      timeout: CHAT_REQUEST_TIMEOUT_MS
    }),
    {
      conversationId: payload.conversationId || "mock-conversation",
      userMessageId: payload.userMessageId || `user-${Date.now()}`,
      assistantMessage: {
        id: `assistant-${Date.now()}`,
        type: "agent",
        text: "\u6536\u5230\uff0c\u6211\u5df2\u7ecf\u5728\u6574\u7406\u4f60\u7684\u4e0b\u4e00\u6b65\u5efa\u8bae\u3002"
      }
    }
  );
}

async function startChatStream(payload = {}) {
  const raw = await requestWithFallback(
    () => post("/chat/stream/start", payload, {
      timeout: CHAT_REQUEST_TIMEOUT_MS
    }),
    {
      streamId: `stream-${Date.now()}`,
      conversationId: payload.conversationId || "mock-conversation",
      status: "streaming"
    }
  );

  return normalizeStreamStart(raw, payload);
}

async function pollChatStream(streamId) {
  if (!streamId) {
    return [];
  }

  const raw = await requestWithFallback(
    () => get(`/chat/stream/${streamId}`),
    []
  );

  return normalizeStreamChunk(raw);
}

function createMockStreamEvents(text = "") {
  const content = String(text || "");
  const tokens = content ? content.split("") : [];
  const streamId = `stream-${Date.now()}`;
  const events = [
    {
      type: CHAT_STREAM_EVENT_TYPES.META,
      streamId,
      createdAt: Date.now()
    }
  ];

  tokens.forEach((token, index) => {
    events.push({
      type: CHAT_STREAM_EVENT_TYPES.TOKEN,
      streamId,
      token,
      index
    });
  });

  events.push({
    type: CHAT_STREAM_EVENT_TYPES.DONE,
    streamId,
    usage: {
      promptTokens: 0,
      completionTokens: tokens.length
    }
  });

  return events;
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
  getConversationScene,
  fetchConversationScene,
  fetchConversationSceneRemote,
  sendChatMessage,
  startChatStream,
  pollChatStream,
  createMockStreamEvents,
  foldStreamEvents
};
