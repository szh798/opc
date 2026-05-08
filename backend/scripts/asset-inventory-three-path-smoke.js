const fs = require("node:fs");
const path = require("node:path");

const axios = require("axios");
const { PrismaClient, SnapshotKind } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");

function buildPrismaClient(databaseUrl) {
  const parsed = new URL(databaseUrl);
  const schema = String(parsed.searchParams.get("schema") || "").trim();
  if (schema) {
    parsed.searchParams.delete("schema");
  }
  const adapter = new PrismaPg(
    {
      connectionString: parsed.toString(),
      application_name: "opc-smoke-asset-inventory",
      min: 1,
      max: 4,
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 60_000
    },
    schema ? { schema } : {}
  );
  return new PrismaClient({ adapter });
}

const baseURL = String(process.env.SMOKE_BASE_URL || process.env.PUBLIC_BASE_URL || "http://127.0.0.1:3000").replace(/\/+$/, "");
const databaseUrl = String(process.env.SMOKE_DATABASE_URL || process.env.DATABASE_URL || "").trim();
const reportPath = String(
  process.env.SMOKE_REPORT_PATH || path.join(process.cwd(), "reports", "asset-inventory-three-path-report.md")
).trim();
const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS || 30000);
const streamTimeoutMs = Number(process.env.SMOKE_STREAM_TIMEOUT_MS || 180000);

function logLine(message) {
  // eslint-disable-next-line no-console
  console.log(message);
}

async function request(method, urlPath, options = {}) {
  return axios({
    method,
    url: `${baseURL}${urlPath}`,
    timeout: timeoutMs,
    validateStatus: () => true,
    ...options
  });
}

function assertStatus(name, response, expected = [200, 201]) {
  const ok = expected.includes(response.status);
  logLine(`${ok ? "[PASS]" : "[FAIL]"} ${name} - ${response.status}`);
  if (!ok) {
    throw new Error(`${name} failed: ${response.status} ${JSON.stringify(response.data)}`);
  }
  return response;
}

async function loginFreshUser(caseName) {
  const response = await request("POST", "/auth/wechat-login", {
    data: {
      simulateFreshUser: true
    }
  });
  assertStatus(`${caseName} login`, response, [200, 201]);

  const data = response.data && typeof response.data === "object" ? response.data : {};
  const accessToken = String(data.accessToken || "").trim();
  const refreshToken = String(data.refreshToken || "").trim();
  const user = data.user && typeof data.user === "object" ? data.user : {};
  const userId = String(user.id || "").trim();

  if (!accessToken || !refreshToken || !userId) {
    throw new Error(`${caseName} login did not return expected tokens/user`);
  }

  return {
    accessToken,
    refreshToken,
    userId,
    user
  };
}

async function pollStream(streamId, headers) {
  const startedAt = Date.now();
  const events = [];

  while (Date.now() - startedAt < streamTimeoutMs) {
    const response = await request("GET", `/router/streams/${encodeURIComponent(streamId)}`, {
      headers
    });
    assertStatus("router stream poll", response, [200]);
    const chunk = Array.isArray(response.data) ? response.data : [];
    if (chunk.length) {
      events.push(...chunk);
      if (chunk.some((event) => event && (event.type === "done" || event.type === "error"))) {
        return events;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`router stream timeout: ${streamId}`);
}

async function startStream(sessionId, headers, text, routeAction = "") {
  const response = await request("POST", `/router/sessions/${encodeURIComponent(sessionId)}/stream/start`, {
    headers,
    data: {
      input: {
        inputType: routeAction ? "system_event" : "text",
        text,
        ...(routeAction ? { routeAction } : {})
      }
    }
  });
  assertStatus("router stream start", response, [200, 201]);

  const payload = response.data && typeof response.data === "object" ? response.data : {};
  const streamId = String(payload.streamId || "").trim();
  if (!streamId) {
    throw new Error("stream start did not return streamId");
  }

  const events = await pollStream(streamId, headers);
  const meta = events.find((event) => event && event.type === "meta") || {};
  const content = events
    .filter((event) => event && event.type === "token")
    .map((event) => String(event.token || ""))
    .join("");

  return {
    streamId,
    routeMode: String(payload.routeMode || ""),
    agentKey: String(payload.agentKey || ""),
    chatflowId: String(payload.chatflowId || ""),
    meta,
    content,
    eventTypes: events.map((event) => String(event && event.type || ""))
  };
}

async function fetchSession(sessionId, headers) {
  const response = await request("GET", `/router/sessions/${encodeURIComponent(sessionId)}`, {
    headers
  });
  assertStatus("router get session", response, [200]);
  return response.data && typeof response.data === "object" ? response.data : {};
}

async function fetchAssetReportStatus(sessionId, headers) {
  const response = await request(
    "GET",
    `/router/sessions/${encodeURIComponent(sessionId)}/asset-report/status`,
    {
      headers
    }
  );
  assertStatus("router asset report status", response, [200]);
  return response.data && typeof response.data === "object" ? response.data : {};
}

async function seedAssetFlow(prisma, userId, seed) {
  const flowState = {
    conversationId: seed.conversationId || "",
    inventoryStage: seed.inventoryStage || "",
    reviewStage: seed.reviewStage || "",
    profileSnapshot: seed.profileSnapshot || "",
    dimensionReports: seed.dimensionReports || "",
    nextQuestion: seed.nextQuestion || "",
    changeSummary: seed.changeSummary || "",
    reportBrief: seed.reportBrief || "",
    finalReport: seed.finalReport || "",
    reportVersion: seed.reportVersion || "",
    lastReportGeneratedAt: seed.lastReportGeneratedAt || "",
    assetWorkflowKey: seed.assetWorkflowKey || "",
    isReview: Boolean(seed.isReview),
    updatedAt: new Date().toISOString()
  };

  await prisma.reportSnapshot.upsert({
    where: {
      userId_kind: {
        userId,
        kind: SnapshotKind.ASSET_INVENTORY
      }
    },
    create: {
      userId,
      kind: SnapshotKind.ASSET_INVENTORY,
      data: {
        flowState
      }
    },
    update: {
      data: {
        flowState
      }
    }
  });
}

function pickAssetModule(session) {
  const list = Array.isArray(session.moduleSessions) ? session.moduleSessions : [];
  return list.find((item) => item && item.agentKey === "asset") || null;
}

function writeReport(results) {
  const reportDir = path.dirname(reportPath);
  fs.mkdirSync(reportDir, { recursive: true });

  const lines = [
    "# Asset Inventory Three-Path Smoke Report",
    "",
    `- Base URL: \`${baseURL}\``,
    `- Generated At: ${new Date().toISOString()}`,
    `- Cases: ${results.length}`,
    ""
  ];

  for (const result of results) {
    lines.push(`## ${result.caseName}`);
    lines.push(`- User ID: \`${result.userId}\``);
    lines.push(`- Session ID: \`${result.sessionId}\``);
    lines.push(`- Expected Asset Workflow: \`${result.expectedWorkflowKey}\``);
    lines.push(`- Actual Asset Workflow: \`${result.actualWorkflowKey || "n/a"}\``);
    lines.push(`- Current Step: \`${result.currentStep || "n/a"}\``);
    lines.push(`- Agent Key: \`${result.agentKey || "n/a"}\``);
    lines.push(`- Inventory Stage: \`${result.inventoryStage || "n/a"}\``);
    lines.push(`- Report Status: \`${result.reportStatus || "n/a"}\``);
    lines.push(`- Report Version: \`${result.reportVersion || "n/a"}\``);
    lines.push(`- Report Last At: \`${result.lastReportAt || "n/a"}\``);
    lines.push(`- Report Last Error: \`${result.lastError || "n/a"}\``);
    lines.push(`- Stream Event Types: \`${result.eventTypes.join(", ")}\``);
    lines.push(`- Stream Preview: ${result.contentPreview || "n/a"}`);
    lines.push("");
  }

  fs.writeFileSync(reportPath, `${lines.join("\n")}\n`, "utf8");
  return reportPath;
}

async function runCase(prisma, caseConfig) {
  const auth = await loginFreshUser(caseConfig.caseName);
  const headers = {
    Authorization: `Bearer ${auth.accessToken}`
  };

  if (caseConfig.seed) {
    await seedAssetFlow(prisma, auth.userId, caseConfig.seed);
  }

  const sessionResponse = await request("POST", "/router/sessions", {
    headers,
    data: {
      source: caseConfig.source || "asset_inventory_three_path_smoke",
      forceNew: true
    }
  });
  assertStatus(`${caseConfig.caseName} session create`, sessionResponse, [200, 201]);
  const sessionData = sessionResponse.data && typeof sessionResponse.data === "object" ? sessionResponse.data : {};
  const sessionId = String(sessionData.sessionId || sessionData.conversationStateId || "").trim();
  if (!sessionId) {
    throw new Error(`${caseConfig.caseName} session did not return sessionId`);
  }

  const stream = await startStream(sessionId, headers, caseConfig.text, caseConfig.routeAction || "");
  const sessionSnapshot = await fetchSession(sessionId, headers);
  const reportStatus = await fetchAssetReportStatus(sessionId, headers);
  const assetModule = pickAssetModule(sessionSnapshot);
  const actualWorkflowKey = String(assetModule && assetModule.assetWorkflowKey || "").trim();
  const currentStep = String(sessionSnapshot.currentStep || "").trim();
  const agentKey = String(sessionSnapshot.agentKey || "").trim();

  const ok = actualWorkflowKey === caseConfig.expectedWorkflowKey;
  logLine(`${ok ? "[PASS]" : "[FAIL]"} ${caseConfig.caseName} workflow - expected ${caseConfig.expectedWorkflowKey}, got ${actualWorkflowKey || "n/a"}`);
  if (!ok) {
    throw new Error(`${caseConfig.caseName} expected workflow ${caseConfig.expectedWorkflowKey}, got ${actualWorkflowKey || "n/a"}`);
  }

  return {
    caseName: caseConfig.caseName,
    userId: auth.userId,
    sessionId,
    expectedWorkflowKey: caseConfig.expectedWorkflowKey,
    actualWorkflowKey,
    currentStep,
    agentKey,
    inventoryStage: String(reportStatus.inventoryStage || "").trim(),
    reportStatus: String(reportStatus.reportStatus || "").trim(),
    reportVersion: String(reportStatus.reportVersion || "").trim(),
    lastReportAt: String(reportStatus.lastReportAt || "").trim(),
    lastError: String(reportStatus.lastError || "").trim(),
    eventTypes: stream.eventTypes,
    contentPreview: stream.content.slice(0, 180)
  };
}

async function run() {
  if (!databaseUrl) {
    throw new Error("SMOKE_DATABASE_URL or DATABASE_URL is required");
  }

  process.env.DATABASE_URL = databaseUrl;

  const prisma = buildPrismaClient(databaseUrl);
  const cases = [
    {
      caseName: "新用户首次盘点",
      expectedWorkflowKey: "firstInventory",
      text: "我想盘点我的资产",
      routeAction: "asset_radar"
    },
    {
      caseName: "未完成断点续盘",
      expectedWorkflowKey: "resumeInventory",
      text: "继续上次没完成的资产盘点",
      routeAction: "asset_radar",
      seed: {
        inventoryStage: "ability",
        profileSnapshot: "能力资产：我能独立完成产品设计和前端落地。",
        dimensionReports: "能力维度小报告：可以持续追问能力证据。",
        nextQuestion: "你最近一次独立推进的项目是什么？",
        reportBrief: "能力维度尚未完成，需要继续补齐。",
        reportVersion: "1",
        isReview: false
      }
    },
    {
      caseName: "复盘更新用户",
      expectedWorkflowKey: "reviewUpdate",
      text: "我最近有新变化，更新我的资产盘点",
      routeAction: "trigger_review",
      seed: {
        inventoryStage: "report_generated",
        profileSnapshot: "能力资产：已完成首次盘点。",
        dimensionReports: "四维资产报告：能力、资源、认知、关系均已梳理。",
        reportBrief: "复盘更新：最近新增了行业资源和合作线索。",
        finalReport: "旧报告摘要：已完成。",
        lastReportGeneratedAt: new Date().toISOString(),
        reportVersion: "2",
        isReview: true
      }
    }
  ];

  try {
    const results = [];
    for (const item of cases) {
      results.push(await runCase(prisma, item));
    }

    const reportFile = writeReport(results);
    logLine(`\n[PASS] report written to ${reportFile}`);
    logLine(JSON.stringify(results, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

run().catch((error) => {
  logLine(`[FAIL] asset inventory smoke - ${error && error.message ? error.message : String(error)}`);
  process.exitCode = 1;
});
