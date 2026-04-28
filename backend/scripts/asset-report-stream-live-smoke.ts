import * as dotenv from "dotenv";
import * as fs from "node:fs";
import * as path from "node:path";
import { randomUUID } from "node:crypto";
import { StringDecoder } from "node:string_decoder";
import axios from "axios";
import type { AxiosResponse } from "axios";
import type { Readable } from "node:stream";
import { Prisma, SnapshotKind } from "@prisma/client";
import { PrismaService } from "../src/shared/prisma.service";

dotenv.config();

type JsonRecord = Record<string, unknown>;

type SseEvent = {
  id: string;
  event: string;
  data: JsonRecord;
};

const baseURL = String(process.env.SMOKE_BASE_URL || process.env.PUBLIC_BASE_URL || "http://127.0.0.1:3000").replace(
  /\/+$/,
  ""
);
const accessTokenFromEnv = String(process.env.SMOKE_ACCESS_TOKEN || "").trim();
const refreshTokenFromEnv = String(process.env.SMOKE_REFRESH_TOKEN || "").trim();
const wechatCodeFromEnv = String(process.env.SMOKE_WECHAT_CODE || "").trim();
const devFreshLoginSecret = String(process.env.SMOKE_DEV_FRESH_LOGIN_SECRET || process.env.DEV_FRESH_LOGIN_SECRET || "").trim();
const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS || 30_000);
const streamTimeoutMs = Number(process.env.SMOKE_STREAM_TIMEOUT_MS || 360_000);
const reportPath = String(
  process.env.SMOKE_REPORT_PATH || path.join(process.cwd(), "reports", "asset-report-stream-live-smoke.md")
);

const sampleProfileSnapshot = [
  "能力资产",
  "- 5 年 B 端 SaaS 产品经理经验，能把客户访谈、需求拆解、PRD、研发排期串起来。",
  "- 负责过从 0 到 1 的内部工具落地，熟悉低代码、自动化流程和数据看板。",
  "- 能把混乱业务问题拆成可执行任务，并推动跨部门交付。",
  "",
  "资源资产",
  "- 手里有一批中小企业老板、运营负责人和产品经理同学资源，可做早期访谈。",
  "- 熟悉微信生态、小程序、企微私域和轻量 SaaS 采购场景。",
  "- 有技术合伙人和设计师协作资源，能快速做出 MVP。",
  "",
  "认知资产",
  "- 对 AI Agent、工作流自动化和企业降本增效有持续观察。",
  "- 能判断哪些需求是真痛点，哪些只是老板的一时兴起。",
  "- 具备商业验证意识，愿意先收集客户原话和付费信号。",
  "",
  "关系资产",
  "- 与 10 位以上 B 端从业者保持弱连接，可用于冷启动访谈。",
  "- 有创业者社群和园区服务方资源，可扩展第一批测试用户。",
  "",
  "真实案例",
  "- 曾经把一个线下销售线索整理流程改造成自动化表单 + 看板，每周节省 8 小时重复沟通。",
  "- 曾帮客户把需求池重构成优先级模型，使研发排期争议明显减少。"
].join("\n");

const sampleDimensionReports = [
  "能力资产小报告",
  "你最强的不是单点写文档，而是把 B 端客户问题拆成产品、流程和自动化方案。这个能力适合切入企业效率工具、AI 工作流顾问和垂直行业轻 SaaS。",
  "",
  "资源资产小报告",
  "你的早期资源适合做 15-20 个高质量访谈，不适合一开始就做大规模投放。最值得用的是中小企业老板和运营负责人的真实业务问题。",
  "",
  "认知资产小报告",
  "你已经有商业验证意识，知道先看客户原话、预算和重复痛点。这能降低做出伪需求产品的概率。",
  "",
  "关系资产小报告",
  "当前关系资产够做冷启动验证，但还不足以直接规模化销售。下一步要把弱连接转成可复访名单和真实反馈证据。"
].join("\n");

const sampleReportBrief = [
  "用户具备 B 端 SaaS 产品、需求拆解、用户研究、流程自动化和 AI 工作流理解能力。",
  "最有商业化潜力的组合是：B 端业务诊断 + AI 自动化流程方案 + 小程序/企微轻交付。",
  "第一轮验证建议围绕 3 个真实客户访谈、1 个重复痛点、1 个可收费 MVP 方案展开。"
].join("\n");

function log(message: string) {
  console.log(message);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertStatus(name: string, response: AxiosResponse<unknown>, expected: number[]) {
  const ok = expected.includes(response.status);
  log(`${ok ? "PASS" : "FAIL"} ${name} ${response.status}`);
  if (!ok) {
    throw new Error(`${name} failed: ${response.status} ${JSON.stringify(response.data)}`);
  }
}

async function requestJson<T = JsonRecord>(
  method: "GET" | "POST",
  urlPath: string,
  options: {
    headers?: Record<string, string>;
    data?: unknown;
    expected?: number[];
  } = {}
): Promise<T> {
  const response = await axios({
    method,
    url: `${baseURL}${urlPath}`,
    timeout: timeoutMs,
    headers: options.headers,
    data: options.data,
    validateStatus: () => true
  });
  assertStatus(`${method} ${urlPath}`, response, options.expected || [200, 201]);
  return response.data as T;
}

async function assertBackendReady() {
  const response = await axios({
    method: "GET",
    url: `${baseURL}/ready`,
    timeout: timeoutMs,
    validateStatus: () => true
  });
  assertStatus("backend ready", response, [200]);
}

function pickUserId(source: unknown) {
  const record = isRecord(source) ? source : {};
  const nestedUser = isRecord(record.user) ? record.user : {};
  return String(record.id || record.sub || record.userId || nestedUser.id || nestedUser.sub || nestedUser.userId || "").trim();
}

async function readCurrentUserId(headers: Record<string, string>) {
  const data = await requestJson<JsonRecord>("GET", "/auth/me", {
    headers,
    expected: [200]
  });
  const userId = pickUserId(data);
  assert(userId, `auth/me did not return user id: ${JSON.stringify(data)}`);
  return userId;
}

async function loginFreshUser() {
  if (accessTokenFromEnv) {
    const headers = {
      Authorization: `Bearer ${accessTokenFromEnv}`
    };
    const userId = await readCurrentUserId(headers);
    log(`PASS using SMOKE_ACCESS_TOKEN user ${userId}`);
    return {
      accessToken: accessTokenFromEnv,
      userId,
      headers
    };
  }

  if (refreshTokenFromEnv) {
    const data = await requestJson<{
      accessToken?: string;
      refreshToken?: string;
      user?: { id?: string };
    }>("POST", "/auth/refresh", {
      data: {
        refreshToken: refreshTokenFromEnv
      }
    });
    const accessToken = String(data.accessToken || "").trim();
    assert(accessToken, "auth refresh did not return accessToken");
    if (data.refreshToken) {
      log(`NEW_SMOKE_REFRESH_TOKEN=${data.refreshToken}`);
    }
    const headers = {
      Authorization: `Bearer ${accessToken}`
    };
    const userId = pickUserId(data) || (await readCurrentUserId(headers));
    log(`PASS refreshed auth user ${userId}`);
    return {
      accessToken,
      userId,
      headers
    };
  }

  if (devFreshLoginSecret) {
    const data = await requestJson<{
      accessToken?: string;
      refreshToken?: string;
      user?: { id?: string };
    }>("POST", "/auth/dev-fresh-login", {
      data: {
        devLoginSecret: devFreshLoginSecret,
        nickname: `stream_smoke_${Date.now()}`
      }
    });
    const accessToken = String(data.accessToken || "").trim();
    const userId = pickUserId(data);
    assert(accessToken, "dev fresh login did not return accessToken");
    assert(userId, "dev fresh login did not return user.id");
    log(`PASS dev fresh login user ${userId}`);
    return {
      accessToken,
      userId,
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    };
  }

  if (wechatCodeFromEnv) {
    const data = await requestJson<{
    accessToken?: string;
    refreshToken?: string;
    user?: { id?: string };
  }>("POST", "/auth/wechat-login", {
    data: {
        code: wechatCodeFromEnv,
        nickname: `stream_smoke_${Date.now()}`
    }
  });
  const accessToken = String(data.accessToken || "").trim();
    const userId = pickUserId(data);
  assert(accessToken, "login did not return accessToken");
  assert(userId, "login did not return user.id");
    log(`PASS wechat code login user ${userId}`);
  return {
    accessToken,
    userId,
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  };
  }

  throw new Error(
    "Missing auth input. Set SMOKE_ACCESS_TOKEN, SMOKE_REFRESH_TOKEN, SMOKE_DEV_FRESH_LOGIN_SECRET/DEV_FRESH_LOGIN_SECRET, or SMOKE_WECHAT_CODE."
  );
}

async function createRouterSession(headers: Record<string, string>) {
  const data = await requestJson<{ sessionId?: string; conversationStateId?: string }>("POST", "/router/sessions", {
    headers,
    data: {
      source: "asset_report_stream_live_smoke",
      forceNew: true
    }
  });
  const sessionId = String(data.sessionId || data.conversationStateId || "").trim();
  assert(sessionId, "router session did not return sessionId");
  log(`PASS created router session ${sessionId}`);
  return sessionId;
}

async function seedReadyAssetSnapshot(prisma: PrismaService, userId: string) {
  const flowState = {
    conversationId: `asset-report-live-smoke-${randomUUID()}`,
    inventoryStage: "ready_for_report",
    reviewStage: "",
    profileSnapshot: sampleProfileSnapshot,
    dimensionReports: sampleDimensionReports,
    nextQuestion: "",
    changeSummary: "",
    reportBrief: sampleReportBrief,
    finalReport: "",
    reportVersion: "",
    lastReportGeneratedAt: "",
    reportStatus: "idle",
    reportError: "",
    assetWorkflowKey: "resumeInventory",
    isReview: false,
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
      } as Prisma.InputJsonValue
    },
    update: {
      data: {
        flowState
      } as Prisma.InputJsonValue
    }
  });

  log("PASS seeded ready_for_report asset snapshot");
}

function createSseParser() {
  let buffer = "";
  return {
    feed(text: string): SseEvent[] {
      buffer += text;
      const events: SseEvent[] = [];

      while (true) {
        const boundary = buffer.indexOf("\n\n");
        if (boundary < 0) {
          break;
        }

        const raw = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const lines = raw.split(/\r?\n/);
        let id = "";
        let event = "message";
        const dataLines: string[] = [];

        for (const line of lines) {
          if (line.startsWith("id:")) {
            id = line.slice(3).trim();
          } else if (line.startsWith("event:")) {
            event = line.slice(6).trim();
          } else if (line.startsWith("data:")) {
            dataLines.push(line.slice(5).trimStart());
          }
        }

        if (!dataLines.length) {
          continue;
        }

        const dataText = dataLines.join("\n");
        let data: JsonRecord;
        try {
          data = JSON.parse(dataText) as JsonRecord;
        } catch (error) {
          throw new Error(`invalid SSE JSON for event ${event}: ${dataText}`);
        }
        events.push({ id, event, data });
      }

      return events;
    }
  };
}

function isRecord(value: unknown): value is JsonRecord {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function formatEvent(event: SseEvent) {
  const seq = typeof event.data.seq === "number" ? event.data.seq : "?";
  if (event.event === "card.patch" && isRecord(event.data.patch)) {
    return `${event.event} seq=${seq} progress=${event.data.patch.progress || ""} step=${event.data.patch.current_step || ""}`;
  }
  if (event.event === "card.created") {
    return `${event.event} seq=${seq} card_type=${event.data.card_type || ""}`;
  }
  return `${event.event} seq=${seq}`;
}

async function postSse(
  sessionId: string,
  headers: Record<string, string>
): Promise<SseEvent[]> {
  const parser = createSseParser();
  const decoder = new StringDecoder("utf8");
  const events: SseEvent[] = [];
  let terminal = false;

  const response = await axios({
    method: "POST",
    url: `${baseURL}/router/sessions/${encodeURIComponent(sessionId)}/messages/stream`,
    timeout: streamTimeoutMs,
    responseType: "stream",
    headers: {
      ...headers,
      "Content-Type": "application/json",
      Accept: "text/event-stream"
    },
    data: {
      clientMessageId: `asset-report-stream-live-${randomUUID()}`,
      input: {
        inputType: "system_event",
        text: "请基于已有资产盘点直接生成资产报告",
        routeAction: "asset_radar",
        metadata: {
          source: "asset_report_stream_live_smoke"
        }
      }
    },
    validateStatus: () => true
  });

  assertStatus("POST /router/sessions/:id/messages/stream", response, [200, 201]);
  const stream = response.data as Readable;

  return await new Promise<SseEvent[]>((resolve, reject) => {
    const timer = setTimeout(() => {
      stream.destroy();
      reject(new Error(`SSE timeout after ${streamTimeoutMs}ms`));
    }, streamTimeoutMs);

    stream.on("data", (chunk: Buffer) => {
      try {
        const text = decoder.write(chunk);
        for (const event of parser.feed(text)) {
          events.push(event);
          if (
            event.event === "card.created" ||
            event.event === "card.patch" ||
            event.event === "card.completed" ||
            event.event === "final_report.created" ||
            event.event === "stream.done" ||
            event.event === "stream.error"
          ) {
            log(`EVENT ${formatEvent(event)}`);
          }
          if (event.event === "stream.error") {
            terminal = true;
            clearTimeout(timer);
            reject(new Error(`stream.error: ${JSON.stringify(event.data)}`));
            stream.destroy();
            return;
          }
          if (event.event === "stream.done") {
            terminal = true;
            clearTimeout(timer);
            stream.destroy();
            resolve(events);
            return;
          }
        }
      } catch (error) {
        clearTimeout(timer);
        stream.destroy();
        reject(error);
      }
    });

    stream.on("end", () => {
      clearTimeout(timer);
      if (terminal) {
        resolve(events);
        return;
      }
      try {
        for (const event of parser.feed(decoder.end())) {
          events.push(event);
        }
      } catch (error) {
        reject(error);
        return;
      }
      reject(new Error("SSE ended before stream.done"));
    });

    stream.on("error", (error) => {
      clearTimeout(timer);
      if (terminal) {
        resolve(events);
        return;
      }
      reject(error);
    });
  });
}

function assertEventContract(events: SseEvent[]) {
  const businessEvents = events.filter((event) => event.event !== "ping");
  assert(businessEvents.length > 0, "no SSE events received");
  let previousSeq = 0;
  for (const event of businessEvents) {
    const seq = Number(event.data.seq);
    assert(Number.isFinite(seq) && seq > previousSeq, `seq not strictly increasing at ${event.event}`);
    previousSeq = seq;
    assert(event.id, `SSE id missing for ${event.event}`);
    assert(event.data.stream_id, `stream_id missing for ${event.event}`);
    assert(event.data.event_id, `event_id missing for ${event.event}`);
    assert(event.data.created_at, `created_at missing for ${event.event}`);
  }

  const created = businessEvents.find((event) => event.event === "card.created" && event.data.card_type === "asset_report_progress");
  assert(created, "asset_report_progress card.created missing");

  const progressPatches = businessEvents.filter((event) => event.event === "card.patch");
  assert(progressPatches.length >= 2, "not enough card.patch events");
  assert(
    progressPatches.some((event) => isRecord(event.data.patch) && Number(event.data.patch.progress || 0) >= 58),
    "card.patch progress did not reach radar preview phase"
  );
  assert(
    progressPatches.some((event) => isRecord(event.data.patch) && Array.isArray(event.data.patch.radar_preview)),
    "radar_preview patch missing"
  );
  assert(businessEvents.some((event) => event.event === "card.completed"), "card.completed missing");

  const finalReport = businessEvents.find((event) => event.event === "final_report.created");
  assert(finalReport && isRecord(finalReport.data.message), "final_report.created missing");
  const segments = Array.isArray(finalReport.data.message.segments) ? finalReport.data.message.segments : [];
  assert(
    segments.some((segment) => isRecord(segment) && segment.card_type === "asset_radar"),
    "final_report.created does not contain asset_radar card"
  );
  assert(businessEvents.some((event) => event.event === "stream.done"), "stream.done missing");

  const visibleText = businessEvents
    .filter((event) => event.event === "assistant.text.delta")
    .map((event) => String(event.data.delta || ""))
    .join("");
  assert(!/<\s*(think|card|flow_)/i.test(visibleText), "internal XML tag leaked into assistant.text.delta");

  log("PASS SSE event contract");
}

async function assertRecoveryEndpoint(streamId: string, headers: Record<string, string>) {
  const data = await requestJson<{ events?: JsonRecord[] }>(
    "GET",
    `/router/streams/${encodeURIComponent(streamId)}/events?afterSeq=0`,
    {
      headers,
      expected: [200]
    }
  );
  assert(Array.isArray(data.events) && data.events.length > 0, "recovery endpoint returned no events");
  assert(data.events.some((event) => event.event_id && event.stream_id === streamId), "recovery events missing stream metadata");
  log(`PASS recovery endpoint returned ${data.events.length} events`);
}

async function assertDatabaseResult(prisma: PrismaService, userId: string) {
  const snapshot = await prisma.reportSnapshot.findUnique({
    where: {
      userId_kind: {
        userId,
        kind: SnapshotKind.ASSET_INVENTORY
      }
    }
  });
  const data = snapshot && isRecord(snapshot.data) ? snapshot.data : {};
  const flowState = isRecord(data.flowState) ? data.flowState : {};
  assert(flowState.inventoryStage === "report_generated", "asset inventory stage is not report_generated");
  assert(flowState.reportStatus === "ready", "asset report status is not ready");
  assert(String(flowState.finalReport || "").trim(), "final report not persisted in flowState");

  const job = await prisma.generationJob.findFirst({
    where: {
      userId,
      jobType: "asset_report"
    },
    orderBy: {
      createdAt: "desc"
    }
  });
  assert(job?.status === "completed", "latest asset_report GenerationJob is not completed");
  assert(job.artifactId, "GenerationJob artifactId missing");
  assert(job.assistantMessageId, "GenerationJob assistantMessageId missing");

  log(`PASS database result job=${job.id} artifact=${job.artifactId}`);
}

function writeReport(input: {
  userId: string;
  sessionId: string;
  streamId: string;
  events: SseEvent[];
}) {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  const eventCounts = input.events.reduce<Record<string, number>>((acc, event) => {
    acc[event.event] = (acc[event.event] || 0) + 1;
    return acc;
  }, {});
  const lines = [
    "# Asset Report Stream Live Smoke",
    "",
    `- Base URL: \`${baseURL}\``,
    `- Generated At: ${new Date().toISOString()}`,
    `- User ID: \`${input.userId}\``,
    `- Session ID: \`${input.sessionId}\``,
    `- Stream ID: \`${input.streamId}\``,
    `- Event Count: ${input.events.length}`,
    "",
    "## Event Counts",
    "",
    ...Object.entries(eventCounts).map(([name, count]) => `- \`${name}\`: ${count}`),
    "",
    "## Important Events",
    "",
    ...input.events
      .filter((event) =>
        ["card.created", "card.patch", "card.completed", "final_report.created", "stream.done"].includes(event.event)
      )
      .map((event) => `- ${formatEvent(event)}`)
  ];
  fs.writeFileSync(reportPath, `${lines.join("\n")}\n`, "utf8");
  log(`PASS report written to ${reportPath}`);
}

async function main() {
  log("Asset report stream live smoke started");
  log(`Base URL: ${baseURL}`);
  log("This command uses real backend routes and may call real Dify workflows.");

  await assertBackendReady();
  const prisma = new PrismaService();
  try {
    await prisma.$connect();
    const auth = await loginFreshUser();
    await seedReadyAssetSnapshot(prisma, auth.userId);
    const sessionId = await createRouterSession(auth.headers);
    const events = await postSse(sessionId, auth.headers);
    assertEventContract(events);
    const streamId = String(events[0]?.data.stream_id || "").trim();
    assert(streamId, "SSE stream_id missing");
    await assertRecoveryEndpoint(streamId, auth.headers);
    await assertDatabaseResult(prisma, auth.userId);
    writeReport({
      userId: auth.userId,
      sessionId,
      streamId,
      events
    });
    log("Asset report stream live smoke completed");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(`FAIL ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
