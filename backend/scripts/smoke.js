const axios = require("axios");

const baseURL = String(process.env.SMOKE_BASE_URL || process.env.PUBLIC_BASE_URL || "http://127.0.0.1:3000").replace(/\/+$/, "");
const refreshToken = String(process.env.SMOKE_REFRESH_TOKEN || "").trim();
const chatMessage = String(process.env.SMOKE_CHAT_MESSAGE || "你好，请用一句话介绍你自己").trim();

function logStep(name, status, detail) {
  const prefix = status ? "PASS" : "FAIL";
  const suffix = detail ? ` - ${detail}` : "";
  console.log(`[${prefix}] ${name}${suffix}`);
}

async function request(method, path, options = {}) {
  const response = await axios({
    method,
    url: `${baseURL}${path}`,
    timeout: Number(process.env.SMOKE_TIMEOUT_MS || 30000),
    validateStatus: () => true,
    ...options
  });

  return response;
}

async function assertOk(name, method, path, options = {}) {
  const response = await request(method, path, options);
  const ok = response.status >= 200 && response.status < 300;
  logStep(name, ok, `${response.status}`);
  if (!ok) {
    throw new Error(`${name} failed: ${response.status} ${JSON.stringify(response.data)}`);
  }
  return response;
}

async function pollStream(streamId, headers) {
  const startedAt = Date.now();
  const timeoutMs = Number(process.env.SMOKE_STREAM_TIMEOUT_MS || 180000);

  while (Date.now() - startedAt < timeoutMs) {
    const response = await assertOk("stream poll", "GET", `/chat/stream/${streamId}`, {
      headers
    });
    const events = Array.isArray(response.data) ? response.data : [];
    if (events.some((event) => event && event.type === "done")) {
      return events;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error("stream poll timeout");
}

async function run() {
  console.log(`Running smoke checks against ${baseURL}`);

  await assertOk("health", "GET", "/health");
  await assertOk("ready", "GET", "/ready");
  await assertOk("bootstrap guest", "GET", "/bootstrap");

  if (!refreshToken) {
    console.log("SMOKE_REFRESH_TOKEN not set, skipping authenticated checks.");
    return;
  }

  const refresh = await assertOk("auth refresh", "POST", "/auth/refresh", {
    data: {
      refreshToken
    }
  });

  const accessToken = String(refresh.data && refresh.data.accessToken || "");
  if (!accessToken) {
    throw new Error("auth refresh succeeded but no access token returned");
  }

  const headers = {
    Authorization: `Bearer ${accessToken}`
  };

  await assertOk("auth me", "GET", "/auth/me", {
    headers
  });
  await assertOk("bootstrap auth", "GET", "/bootstrap", {
    headers
  });
  await assertOk("projects", "GET", "/projects", {
    headers
  });
  await assertOk("tasks daily", "GET", "/tasks/daily", {
    headers
  });
  await assertOk("growth tree", "GET", "/growth/tree", {
    headers
  });
  await assertOk("weekly report", "GET", "/reports/weekly", {
    headers
  });
  await assertOk("monthly report", "GET", "/reports/monthly", {
    headers
  });
  await assertOk("share preview", "GET", "/share/preview", {
    headers
  });

  const streamStart = await assertOk("chat stream start", "POST", "/chat/stream/start", {
    headers,
    data: {
      sceneKey: "ai_assistant",
      conversationId: `smoke-${Date.now()}`,
      message: chatMessage
    },
    timeout: Number(process.env.SMOKE_CHAT_TIMEOUT_MS || 310000)
  });

  const streamId = String(streamStart.data && streamStart.data.streamId || "");
  if (!streamId) {
    throw new Error("chat stream start succeeded but no streamId returned");
  }

  await pollStream(streamId, headers);
}

run().catch((error) => {
  logStep("smoke suite", false, error.message);
  process.exitCode = 1;
});
