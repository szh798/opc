const axios = require("axios");

const baseURL = String(process.env.SMOKE_BASE_URL || "http://192.168.10.253:3000").replace(/\/+$/, "");
const accessTokenFromEnv = String(process.env.SMOKE_ACCESS_TOKEN || "").trim();
const refreshTokenFromEnv = String(process.env.SMOKE_REFRESH_TOKEN || "").trim();
const wechatCode = String(process.env.SMOKE_WECHAT_CODE || "").trim();
const timeout = Number(process.env.SMOKE_TIMEOUT_MS || 120000);

function logStep(name, ok, detail = "") {
  const tag = ok ? "PASS" : "FAIL";
  const suffix = detail ? ` - ${detail}` : "";
  console.log(`[${tag}] ${name}${suffix}`);
}

async function request(method, path, options = {}) {
  return axios({
    method,
    url: `${baseURL}${path}`,
    timeout,
    validateStatus: () => true,
    ...options
  });
}

function assertStatus(name, response, expected = [200, 201]) {
  const ok = expected.includes(response.status);
  logStep(name, ok, String(response.status));
  if (!ok) {
    throw new Error(`${name} failed: ${response.status} ${JSON.stringify(response.data)}`);
  }
  return response;
}

async function resolveAccessToken() {
  if (accessTokenFromEnv) {
    logStep("access token from env", true);
    return accessTokenFromEnv;
  }

  if (refreshTokenFromEnv) {
    const response = await request("POST", "/auth/refresh", {
      data: {
        refreshToken: refreshTokenFromEnv
      }
    });
    assertStatus("auth refresh", response);
    const token = String(response.data && response.data.accessToken || "");
    if (!token) {
      throw new Error("auth refresh did not return accessToken");
    }
    return token;
  }

  if (wechatCode) {
    const response = await request("POST", "/auth/wechat-login", {
      data: {
        code: wechatCode
      }
    });
    assertStatus("wechat login", response);
    const token = String(response.data && response.data.accessToken || "");
    if (!token) {
      throw new Error("wechat login did not return accessToken");
    }
    return token;
  }

  throw new Error(
    "Missing auth input. Set one of SMOKE_ACCESS_TOKEN, SMOKE_REFRESH_TOKEN, or SMOKE_WECHAT_CODE."
  );
}

async function pollRouterStream(streamId, headers) {
  const response = await request("GET", `/router/streams/${encodeURIComponent(streamId)}`, {
    headers
  });
  assertStatus("router stream poll", response, [200]);
  const events = Array.isArray(response.data) ? response.data : [];
  const tokenText = events
    .filter((event) => event && event.type === "token")
    .map((event) => String(event.token || ""))
    .join("");
  const cardTypes = events
    .filter((event) => event && event.type === "card")
    .map((event) => String(event.cardType || event.card && event.card.cardType || ""))
    .filter(Boolean);

  logStep("router stream has meta", events.some((event) => event && event.type === "meta"));
  logStep("router stream has token", !!tokenText);
  logStep("router stream has done", events.some((event) => event && event.type === "done"));

  console.log(
    JSON.stringify(
      {
        eventTypes: events.map((event) => event && event.type),
        cardTypes,
        tokenPreview: tokenText.slice(0, 200)
      },
      null,
      2
    )
  );
}

async function run() {
  console.log(`Running remote Dify smoke against ${baseURL}`);

  assertStatus("health", await request("GET", "/health"), [200]);
  assertStatus("ready", await request("GET", "/ready"), [200]);

  const accessToken = await resolveAccessToken();
  const headers = {
    Authorization: `Bearer ${accessToken}`
  };

  assertStatus("auth me", await request("GET", "/auth/me", { headers }), [200]);

  const session = assertStatus(
    "router create session",
    await request("POST", "/router/sessions", {
      headers,
      data: {
        source: "remote_dify_smoke",
        forceNew: true
      }
    })
  );
  const sessionId = String(session.data && (session.data.sessionId || session.data.conversationStateId) || "");
  if (!sessionId) {
    throw new Error("router create session did not return sessionId");
  }

  const start = assertStatus(
    "router asset stream start",
    await request("POST", `/router/sessions/${encodeURIComponent(sessionId)}/stream/start`, {
      headers,
      data: {
        input: {
          inputType: "text",
          text: "帮我盘点一下我的资产，我想找到一人公司的方向"
        }
      }
    })
  );
  const streamId = String(start.data && start.data.streamId || "");
  if (!streamId) {
    throw new Error("router stream start did not return streamId");
  }

  console.log(
    JSON.stringify(
      {
        sessionId,
        streamId,
        agentKey: start.data.agentKey,
        routeMode: start.data.routeMode,
        chatflowId: start.data.chatflowId
      },
      null,
      2
    )
  );
  await pollRouterStream(streamId, headers);
}

run().catch((error) => {
  logStep("remote Dify smoke", false, error.message);
  process.exitCode = 1;
});
