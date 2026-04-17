const axios = require("axios");

const baseURL = String(process.env.SMOKE_BASE_URL || process.env.PUBLIC_BASE_URL || "http://127.0.0.1:3000").replace(/\/+$/, "");
const refreshToken = String(process.env.SMOKE_REFRESH_TOKEN || "").trim();
const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS || 30000);
const streamTimeoutMs = Number(process.env.SMOKE_STREAM_TIMEOUT_MS || 180000);

function logStep(name, ok, detail = "") {
  const tag = ok ? "PASS" : "FAIL";
  const suffix = detail ? ` - ${detail}` : "";
  // eslint-disable-next-line no-console
  console.log(`[${tag}] ${name}${suffix}`);
}

async function request(method, path, options = {}) {
  return axios({
    method,
    url: `${baseURL}${path}`,
    timeout: timeoutMs,
    validateStatus: () => true,
    ...options
  });
}

async function assertStatus(name, method, path, expected = [200], options = {}) {
  const response = await request(method, path, options);
  const ok = expected.includes(response.status);
  logStep(name, ok, `${response.status}`);
  if (!ok) {
    throw new Error(`${name} failed: ${response.status} ${JSON.stringify(response.data)}`);
  }
  return response;
}

async function pollRouterStream(streamId, headers = {}) {
  const startedAt = Date.now();
  const events = [];

  while (Date.now() - startedAt < streamTimeoutMs) {
    const response = await assertStatus("router stream poll", "GET", `/router/streams/${streamId}`, [200], {
      headers
    });
    const chunk = Array.isArray(response.data) ? response.data : [];
    if (chunk.length) {
      events.push(...chunk);
      if (chunk.some((event) => event && event.type === "done")) {
        return events;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 800));
  }

  throw new Error(`router stream timeout: ${streamId}`);
}

async function startAndAssertStream(name, sessionId, payload, headers) {
  const start = await assertStatus(name, "POST", `/router/sessions/${sessionId}/stream/start`, [200, 201], {
    headers,
    data: payload
  });
  const streamId = String((start.data && start.data.streamId) || "");
  if (!streamId) {
    throw new Error(`${name} missing streamId`);
  }

  const events = await pollRouterStream(streamId, headers);
  const metaEvents = events.filter((event) => event && event.type === "meta");
  const doneEvents = events.filter((event) => event && event.type === "done");
  const tokenEvents = events.filter((event) => event && event.type === "token");
  const errorEvents = events.filter((event) => event && event.type === "error");
  const doneStatuses = doneEvents.map((event) => String((event && event.status) || "").trim());

  logStep(`${name} events meta`, metaEvents.length > 0, String(metaEvents.length));
  logStep(`${name} events done`, doneEvents.length === 1, String(doneEvents.length));
  logStep(`${name} events token`, tokenEvents.length > 0, String(tokenEvents.length));
  logStep(`${name} events error`, errorEvents.length === 0, String(errorEvents.length));

  if (metaEvents.length === 0) {
    throw new Error(`${name} missing meta event`);
  }
  if (doneEvents.length !== 1) {
    throw new Error(`${name} invalid terminal event count: ${doneEvents.length}`);
  }
  if (errorEvents.length > 0) {
    const reason = errorEvents.map((event) => String(event.message || "")).filter(Boolean).join(" | ") || "unknown_error";
    throw new Error(`${name} received stream error: ${reason}`);
  }
  if (tokenEvents.length === 0) {
    throw new Error(`${name} missing token events`);
  }
  if (doneStatuses[0] && doneStatuses[0] !== "success") {
    throw new Error(`${name} done status should be success, got: ${doneStatuses[0]}`);
  }

  return events;
}

async function run() {
  // eslint-disable-next-line no-console
  console.log(`Running router phase4 smoke against ${baseURL}`);

  await assertStatus("health", "GET", "/health", [200]);

  if (!refreshToken) {
    // eslint-disable-next-line no-console
    console.log("SMOKE_REFRESH_TOKEN not provided. Router authenticated smoke skipped.");
    return;
  }

  const refresh = await assertStatus("auth refresh", "POST", "/auth/refresh", [200, 201], {
    data: {
      refreshToken
    }
  });
  const accessToken = String((refresh.data && refresh.data.accessToken) || "");
  if (!accessToken) {
    throw new Error("auth refresh succeeded but no accessToken");
  }

  const headers = {
    Authorization: `Bearer ${accessToken}`
  };

  const sessionResp = await assertStatus("router create session", "POST", "/router/sessions", [200, 201], {
    headers,
    data: {
      source: "phase4_smoke"
    }
  });
  const sessionId = String((sessionResp.data && (sessionResp.data.sessionId || sessionResp.data.conversationStateId)) || "");
  if (!sessionId) {
    throw new Error("router session id missing");
  }

  await assertStatus("router get session", "GET", `/router/sessions/${sessionId}`, [200], {
    headers
  });
  const reportStatusResp = await assertStatus(
    "router asset report status",
    "GET",
    `/router/sessions/${sessionId}/asset-report/status`,
    [200],
    {
      headers
    }
  );
  const reportStatusPayload = reportStatusResp.data && typeof reportStatusResp.data === "object"
    ? reportStatusResp.data
    : {};
  const hasStatusFields = [
    "assetWorkflowKey",
    "inventoryStage",
    "reportStatus",
    "reportVersion",
    "lastReportAt",
    "lastError"
  ].every((key) => Object.prototype.hasOwnProperty.call(reportStatusPayload, key));
  logStep("router asset report status fields", hasStatusFields);
  if (!hasStatusFields) {
    throw new Error(`router asset report status missing fields: ${JSON.stringify(reportStatusPayload)}`);
  }

  await startAndAssertStream(
    "router text stream",
    sessionId,
    {
      input: {
        inputType: "text",
        text: "I want to improve conversion this week"
      }
    },
    headers
  );

  await assertStatus("router quick reply", "POST", `/router/sessions/${sessionId}/quick-reply`, [200, 201], {
    headers,
    data: {
      quickReplyId: "qr-smoke-001",
      routeAction: "route_explore",
      metadata: {
        quickReplyLabel: "Smoke quick reply"
      }
    }
  }).then(async (response) => {
    const streamId = String((response.data && response.data.streamId) || "");
    if (!streamId) {
      throw new Error("quick reply streamId missing");
    }
    const events = await pollRouterStream(streamId, headers);
    const hasDone = events.some((event) => event && event.type === "done");
    const hasError = events.some((event) => event && event.type === "error");
    if (!hasDone || hasError) {
      throw new Error("quick reply stream protocol check failed");
    }
  });

  await assertStatus("router switch agent", "POST", `/router/sessions/${sessionId}/agent-switch`, [200, 201], {
    headers,
    data: {
      agentKey: "execution"
    }
  });

  await assertStatus("router memory preview", "POST", `/router/sessions/${sessionId}/memory/inject-preview`, [200, 201], {
    headers,
    data: {}
  });

  const systemEvents = [
    {
      name: "company action route",
      routeAction: "company_tax_followup",
      text: "sync company tax panel action"
    },
    {
      name: "project cta route",
      routeAction: "project_execution_followup",
      text: "continue project execution"
    },
    {
      name: "task complete route",
      routeAction: "task_completed",
      text: "task completed: follow up one lead"
    }
  ];

  for (const event of systemEvents) {
    await startAndAssertStream(
      event.name,
      sessionId,
      {
        input: {
          inputType: "system_event",
          text: event.text,
          routeAction: event.routeAction
        }
      },
      headers
    );
  }
}

run().catch((error) => {
  logStep("router phase4 smoke", false, error.message);
  process.exitCode = 1;
});
