import axios, { AxiosRequestConfig } from "axios";

const baseURL = String(
  process.env.SMOKE_BASE_URL || process.env.PUBLIC_BASE_URL || "http://127.0.0.1:3000"
).replace(/\/+$/, "");
const accessTokenFromEnv = String(process.env.SMOKE_ACCESS_TOKEN || "").trim();
const refreshToken = String(process.env.SMOKE_REFRESH_TOKEN || "").trim();
const chatMessage = String(process.env.SMOKE_CHAT_MESSAGE || "我想先梳理一下现在最适合我的方向").trim();

function logPass(name: string, detail?: string) {
  console.log(`[PASS] ${name}${detail ? ` - ${detail}` : ""}`);
}

function logFail(name: string, detail: string) {
  console.error(`[FAIL] ${name} - ${detail}`);
}

async function request<T = unknown>(
  method: string,
  path: string,
  options: AxiosRequestConfig = {}
) {
  return axios<T>({
    method,
    url: `${baseURL}${path}`,
    timeout: Number(process.env.SMOKE_TIMEOUT_MS || 30000),
    validateStatus: () => true,
    ...options
  });
}

async function assertOk<T = any>(
  name: string,
  method: string,
  path: string,
  options: AxiosRequestConfig = {}
) {
  const response = await request<T>(method, path, options);
  const ok = response.status >= 200 && response.status < 300;
  if (!ok) {
    throw new Error(`${name} failed: ${response.status} ${JSON.stringify(response.data)}`);
  }
  logPass(name, String(response.status));
  return response;
}

async function resolveAccessToken() {
  if (accessTokenFromEnv) {
    return accessTokenFromEnv;
  }
  if (!refreshToken) {
    throw new Error("SMOKE_ACCESS_TOKEN or SMOKE_REFRESH_TOKEN is required for router live smoke");
  }

  const refresh = await assertOk<{ accessToken?: string; refreshToken?: string }>(
    "router auth refresh",
    "POST",
    "/auth/refresh",
    {
      data: {
        refreshToken
      }
    }
  );

  const accessToken = String(refresh.data?.accessToken || "");
  const nextRefreshToken = String(refresh.data?.refreshToken || "");
  if (nextRefreshToken) {
    console.log(`NEW_SMOKE_REFRESH_TOKEN=${nextRefreshToken}`);
  }
  if (!accessToken) {
    throw new Error("router live smoke could not obtain access token");
  }
  return accessToken;
}

async function pollRouterStream(streamId: string, headers: Record<string, string>) {
  const startedAt = Date.now();
  const timeoutMs = Number(process.env.SMOKE_STREAM_TIMEOUT_MS || 180000);

  while (Date.now() - startedAt < timeoutMs) {
    const response = await assertOk<any[]>("router stream poll", "GET", `/router/streams/${streamId}`, {
      headers
    });
    const events = Array.isArray(response.data) ? response.data : [];
    if (events.some((event) => event && event.type === "error")) {
      throw new Error(`router stream error: ${JSON.stringify(events)}`);
    }
    if (events.some((event) => event && event.type === "done")) {
      return events;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error(`router stream timeout: ${streamId}`);
}

async function resolveStreamEvents(
  name: string,
  responseData: Record<string, any>,
  headers: Record<string, string>
) {
  const inlineEvents = Array.isArray(responseData?.events) ? responseData.events : [];
  if (inlineEvents.some((event: any) => event && event.type === "error")) {
    throw new Error(`${name} returned inline error events`);
  }
  if (inlineEvents.some((event: any) => event && event.type === "done")) {
    return inlineEvents;
  }

  const streamId = String(responseData?.streamId || "");
  if (!streamId) {
    throw new Error(`${name} succeeded but no streamId was returned`);
  }
  return pollRouterStream(streamId, headers);
}

async function main() {
  console.log(`Running router live smoke against ${baseURL}`);
  const accessToken = await resolveAccessToken();
  const headers = {
    Authorization: `Bearer ${accessToken}`
  };

  const create = await assertOk<Record<string, any>>("router create session", "POST", "/router/sessions", {
    headers,
    data: {
      source: "router-live-smoke",
      forceNew: true
    }
  });

  const sessionId = String(create.data?.sessionId || create.data?.conversationStateId || "");
  if (!sessionId) {
    throw new Error("router session response is missing sessionId");
  }
  const quickReplies = Array.isArray(create.data?.quickReplies) ? create.data.quickReplies : [];
  if (!quickReplies.length) {
    throw new Error("router create session returned empty quickReplies");
  }
  const firstScreenMessages = Array.isArray(create.data?.firstScreenMessages)
    ? create.data.firstScreenMessages
    : [];
  if (!firstScreenMessages.length) {
    throw new Error("router create session returned empty firstScreenMessages");
  }
  logPass("router create session payload", `sessionId=${sessionId}`);

  await assertOk("router get session", "GET", `/router/sessions/${sessionId}`, {
    headers
  });

  const firstQuickReply = quickReplies[0];
  const quickReplyResponse = await assertOk<Record<string, any>>(
    "router quick reply",
    "POST",
    `/router/sessions/${sessionId}/quick-reply`,
    {
      headers,
      data: {
        quickReplyId: String(firstQuickReply.quickReplyId || ""),
        routeAction: String(firstQuickReply.routeAction || "")
      },
      timeout: Number(process.env.SMOKE_CHAT_TIMEOUT_MS || 310000)
    }
  );
  await resolveStreamEvents("router quick reply", quickReplyResponse.data, headers);

  const textResponse = await assertOk<Record<string, any>>(
    "router text stream start",
    "POST",
    `/router/sessions/${sessionId}/stream/start`,
    {
      headers,
      data: {
        input: {
          inputType: "text",
          text: chatMessage
        }
      },
      timeout: Number(process.env.SMOKE_CHAT_TIMEOUT_MS || 310000)
    }
  );
  await resolveStreamEvents("router text stream start", textResponse.data, headers);

  await assertOk("router asset report status", "GET", `/router/sessions/${sessionId}/asset-report/status`, {
    headers
  });

  const switchAgent = await assertOk<Record<string, any>>(
    "router agent switch",
    "POST",
    `/router/sessions/${sessionId}/agent-switch`,
    {
      headers,
      data: {
        agentKey: "asset"
      }
    }
  );
  const switchedQuickReplies = Array.isArray(switchAgent.data?.quickReplies) ? switchAgent.data.quickReplies : [];
  if (!switchedQuickReplies.length) {
    throw new Error("router agent switch returned empty quickReplies");
  }
}

main().catch((error) => {
  logFail("router live smoke", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
