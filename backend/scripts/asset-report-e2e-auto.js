/**
 * 资产报告生成 —— 全自动多轮对话 E2E 测试
 *
 * 模拟真实用户流程：登录 → 创建 session → 触发资产盘点 → 自动回复每轮提问 → 等待报告生成
 * 不再需要人工在对话框里一句一句回复。
 *
 * 用法：
 *   cd backend && node scripts/asset-report-e2e-auto.js
 *
 * 环境变量（来自 backend/.env）：
 *   SMOKE_BASE_URL / PUBLIC_BASE_URL  - 后端地址，默认 http://127.0.0.1:3000
 *   SMOKE_STREAM_TIMEOUT_MS           - 单轮流式超时，默认 180000 (3分钟)
 *   SMOKE_REPORT_TIMEOUT_MS           - 报告生成轮询超时，默认 300000 (5分钟)
 *   SMOKE_MAX_TURNS                   - 最大对话轮次，默认 20
 */

const fs = require("node:fs");
const path = require("node:path");
const axios = require("axios");

require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

// ─── 配置 ───────────────────────────────────────────────
const baseURL = String(
  process.env.SMOKE_BASE_URL || process.env.PUBLIC_BASE_URL || "http://127.0.0.1:3000"
).replace(/\/+$/, "");
const streamTimeoutMs = Number(process.env.SMOKE_STREAM_TIMEOUT_MS || 180000);
const reportTimeoutMs = Number(process.env.SMOKE_REPORT_TIMEOUT_MS || 300000);
const maxTurns = Number(process.env.SMOKE_MAX_TURNS || 20);
const reportPath = path.join(__dirname, "..", "reports", "asset-report-e2e-auto.md");

// ─── 预定义的回答（按维度）──────────────────────────────
// Dify 资产盘点流会依次追问 能力→资源→认知→关系，每个维度可能有 1~3 轮追问。
// 这里提供一组足够丰富的回答，脚本根据 AI 提问中的关键词自动选择。
const ANSWERS = {
  // 初始触发
  opening:
    "我想盘点我的资产，我目前在做一个创业者指导小程序项目。",

  // 能力维度
  ability: [
    "我能独立搭建微信小程序前端、NestJS 后端、Prisma 数据库和 Dify 工作流。" +
    "最近从 0 到 1 搭了一个完整的创业者指导产品，包括路由对话、资产盘点、档案页和报告生成。",

    "具体案例：我独立完成了一个内部 OKR 管理平台，3 个月覆盖 200+ 员工。" +
    "还做了一个技术博客，半年涨粉 5000，单篇最高阅读 8 万。" +
    "能力上的短板是团队管理经验不足，后端深度还需要加强。",

    "补充一下，我还能把模糊的产品想法拆解成页面、组件、接口、数据库表和用户流程。" +
    "对话产品我能设计成状态机结构：用户状态 → 触发条件 → 交付物 → 下一步行动。"
  ],

  // 资源维度
  resource: [
    "资源方面：我有一个接近完整的一树 OPC 项目（小程序+后端+数据库+Dify 工作流）。" +
    "还有一个技术博客，5000 订阅用户，留存率 35%。" +
    "开发工具齐全：微信开发者工具、本地后端、PostgreSQL、Dify 和真实 API key。",

    "我有完整的产品文档、架构文档、资产盘点 DSL、提示词模板和测试脚本。" +
    "这些都可以复用，也可以沉淀成内容吸引同频用户。" +
    "人脉方面有 3 位前同事 CTO，其中一位前老板是潜在天使投资人。"
  ],

  // 认知维度
  cognition: [
    "认知方面：我相信一人公司的核心是资产复用、自动化、低成本验证和持续交付。" +
    "AI 产品的价值不是简单聊天，而是在关键节点生成报告、计划、判断和下一步行动。" +
    "先跑通真实闭环比追求完整大系统更重要。",

    "我适合做方法论 + 工具链 + 产品化服务，不适合纯体力型外包。" +
    "对开发者工具和 B 端 SaaS 冷启动打法有独立判断。"
  ],

  // 关系维度
  relationship: [
    "关系资产：我能接触到创业者、产品人、开发者、自由职业者和想做副业的人。" +
    "可以找熟人试用产品收集第一批真实反馈。" +
    "3 位潜在合伙人已经建立了月度交流节奏。",

    "我可以通过项目开发过程中的内容输出，吸引对 AI 工具、一人公司、小程序和自动化感兴趣的人。" +
    "未来围绕 AI 工具搭建、小程序 MVP、Dify 工作流、创业者资产盘点做轻咨询或产品化服务。"
  ],

  // 通用兜底：当无法匹配维度时使用
  fallback: [
    "好的，我补充一下：我的核心优势是从 0 到 1 的全栈交付能力加上技术内容沉淀。" +
    "短板是商业化经验和团队管理。我觉得可以先用博客受众做小规模付费产品验证。",

    "没问题，你说的对。信息应该足够了，你可以直接生成报告。",

    "可以的，请直接生成资产报告吧，信息已经足够完整了。"
  ]
};

// 维度关键词匹配
const DIMENSION_PATTERNS = [
  { key: "ability",       patterns: [/能力/,  /技能/, /擅长/, /做过.*项目/, /案例/, /成就/, /做过什么/] },
  { key: "resource",      patterns: [/资源/,  /工具/, /平台/, /资产.*有/, /拥有/, /手头/, /现有/] },
  { key: "cognition",     patterns: [/认知/,  /理解/, /判断/, /信念/, /洞察/, /看法/, /怎么看/] },
  { key: "relationship",  patterns: [/关系/,  /人脉/, /合作/, /伙伴/, /圈子/, /社交/, /联系/] }
];

// ─── 工具函数 ───────────────────────────────────────────
function log(line) {
  const ts = new Date().toISOString().slice(11, 19);
  // eslint-disable-next-line no-console
  console.log(`[${ts}] ${line}`);
}

async function request(method, urlPath, options = {}) {
  return axios({
    method,
    url: `${baseURL}${urlPath}`,
    timeout: options.timeout || 30000,
    validateStatus: () => true,
    ...options
  });
}

function assertOk(label, res, expected = [200, 201]) {
  const ok = expected.includes(res.status);
  if (!ok) {
    throw new Error(`${label} failed: HTTP ${res.status} ${JSON.stringify(res.data).slice(0, 500)}`);
  }
  return res;
}

// ─── 步骤函数 ───────────────────────────────────────────

async function loginFreshUser() {
  log("登录模拟新用户...");
  const res = await request("POST", "/auth/wechat-login", {
    data: { simulateFreshUser: true, nickname: `e2e_auto_${Date.now()}` }
  });
  assertOk("login", res);
  const { accessToken, user } = res.data;
  if (!accessToken) throw new Error("login: no accessToken");
  log(`登录成功: userId=${user?.id}, nickname=${user?.nickname}`);
  return { accessToken, userId: user?.id || "" };
}

async function createSession(headers) {
  log("创建 router session (asset_radar)...");
  const res = await request("POST", "/router/sessions", {
    headers,
    data: { source: "e2e_auto_asset_report", forceNew: true }
  });
  assertOk("create session", res);
  const sessionId = String(res.data.conversationStateId || res.data.sessionId || "").trim();
  if (!sessionId) throw new Error("session: no sessionId");
  log(`Session 创建成功: ${sessionId}`);
  return sessionId;
}

async function startStream(sessionId, headers, text, routeAction) {
  const inputPayload = {
    inputType: routeAction ? "system_event" : "text",
    text,
    ...(routeAction ? { routeAction } : {})
  };

  const res = await request("POST", `/router/sessions/${sessionId}/stream/start`, {
    headers,
    data: { input: inputPayload },
    timeout: streamTimeoutMs
  });
  assertOk("stream start", res);

  const streamId = String(res.data.streamId || "").trim();
  if (!streamId) throw new Error("stream start: no streamId");
  return streamId;
}

async function pollStream(streamId, headers) {
  const deadline = Date.now() + streamTimeoutMs;
  const allEvents = [];

  while (Date.now() < deadline) {
    const res = await request("GET", `/router/streams/${streamId}`, { headers });
    assertOk("stream poll", res);
    const chunk = Array.isArray(res.data) ? res.data : [];
    if (chunk.length) {
      allEvents.push(...chunk);
      const isDone = chunk.some((e) => e && (e.type === "done" || e.type === "error"));
      if (isDone) break;
    }
    await new Promise((r) => setTimeout(r, 800));
  }

  const content = allEvents
    .filter((e) => e && e.type === "token")
    .map((e) => String(e.token || ""))
    .join("");

  const hasError = allEvents.some((e) => e && e.type === "error");

  return { content, events: allEvents, hasError };
}

async function sendAndReceive(sessionId, headers, text, routeAction) {
  const streamId = await startStream(sessionId, headers, text, routeAction);
  const result = await pollStream(streamId, headers);
  return result;
}

async function fetchReportStatus(sessionId, headers) {
  const res = await request("GET", `/router/sessions/${sessionId}/asset-report/status`, {
    headers
  });
  assertOk("report status", res);
  return res.data || {};
}

// ─── 智能选答 ───────────────────────────────────────────
function pickAnswer(aiMessage, turnIndex, usedCounts) {
  // 先尝试匹配维度
  for (const dim of DIMENSION_PATTERNS) {
    const matched = dim.patterns.some((p) => p.test(aiMessage));
    if (matched) {
      const pool = ANSWERS[dim.key] || ANSWERS.fallback;
      const idx = usedCounts[dim.key] || 0;
      usedCounts[dim.key] = idx + 1;
      if (idx < pool.length) {
        return { dimension: dim.key, text: pool[idx] };
      }
      // 该维度回答用完了，用兜底
    }
  }

  // 兜底
  const fbIdx = usedCounts.fallback || 0;
  usedCounts.fallback = fbIdx + 1;
  const pool = ANSWERS.fallback;
  return { dimension: "fallback", text: pool[Math.min(fbIdx, pool.length - 1)] };
}

// ─── 判断是否已结束盘点 ─────────────────────────────────
function isInventoryComplete(aiMessage, reportStatus) {
  if (/\[INVENTORY_COMPLETE\]/.test(aiMessage)) return true;
  if (/\[REVIEW_COMPLETE\]/.test(aiMessage)) return true;
  if (reportStatus === "pending" || reportStatus === "ready") return true;
  // AI 可能用自然语言表达"已收齐"
  if (/报告正在生成/.test(aiMessage)) return true;
  if (/信息已收齐/.test(aiMessage)) return true;
  if (/报告已生成/.test(aiMessage)) return true;
  return false;
}

// ─── 等待报告就绪 ───────────────────────────────────────
async function waitForReport(sessionId, headers) {
  log("轮询等待报告生成...");
  const deadline = Date.now() + reportTimeoutMs;

  while (Date.now() < deadline) {
    const status = await fetchReportStatus(sessionId, headers);
    const rs = String(status.reportStatus || "").toLowerCase();

    if (rs === "ready") {
      log(`[PASS] 报告已生成! version=${status.reportVersion}, generatedAt=${status.lastReportAt}`);
      return status;
    }
    if (rs === "failed") {
      throw new Error(`报告生成失败: ${status.lastError || "unknown"}`);
    }

    log(`  reportStatus=${rs}, 继续等待...`);
    await new Promise((r) => setTimeout(r, 3000));
  }

  throw new Error(`报告生成超时 (${reportTimeoutMs / 1000}s)`);
}

// ─── 主流程 ─────────────────────────────────────────────
async function main() {
  log(`=== 资产报告全自动 E2E 测试 ===`);
  log(`后端地址: ${baseURL}`);
  log(`最大对话轮次: ${maxTurns}`);
  log("");

  // 0. 健康检查
  const health = await request("GET", "/health");
  assertOk("health check", health);
  log("后端健康检查通过");

  // 1. 登录
  const { accessToken, userId } = await loginFreshUser();
  const headers = { Authorization: `Bearer ${accessToken}` };

  // 2. 创建 session
  const sessionId = await createSession(headers);

  // 3. 多轮对话
  const usedCounts = {};
  const transcript = [];
  let inventoryDone = false;
  let lastReportStatus = "";

  // 第一轮：触发资产盘点
  log(`\n--- 第 1 轮 (触发 asset_radar) ---`);
  log(`用户: ${ANSWERS.opening.slice(0, 80)}...`);
  const firstResult = await sendAndReceive(sessionId, headers, ANSWERS.opening, "asset_radar");
  log(`AI: ${firstResult.content.slice(0, 120)}...`);
  transcript.push({ turn: 1, role: "user", text: ANSWERS.opening, routeAction: "asset_radar" });
  transcript.push({ turn: 1, role: "ai", text: firstResult.content });

  // 检查第一轮是否就完成了（比如一次性给齐信息）
  const status1 = await fetchReportStatus(sessionId, headers);
  lastReportStatus = String(status1.reportStatus || "");
  if (isInventoryComplete(firstResult.content, lastReportStatus)) {
    inventoryDone = true;
    log("第一轮就触发了报告生成!");
  }

  // 后续轮次
  for (let turn = 2; turn <= maxTurns && !inventoryDone; turn++) {
    // 用上一轮 AI 的回复来选答案
    const prevAiText = transcript[transcript.length - 1]?.text || "";
    const answer = pickAnswer(prevAiText, turn, usedCounts);

    log(`\n--- 第 ${turn} 轮 (匹配维度: ${answer.dimension}) ---`);
    log(`用户: ${answer.text.slice(0, 80)}...`);

    const result = await sendAndReceive(sessionId, headers, answer.text);
    log(`AI: ${result.content.slice(0, 120)}...`);

    transcript.push({ turn, role: "user", text: answer.text, dimension: answer.dimension });
    transcript.push({ turn, role: "ai", text: result.content });

    if (result.hasError) {
      log(`[WARN] 流式返回包含 error 事件`);
    }

    // 检查是否完成
    const statusN = await fetchReportStatus(sessionId, headers);
    lastReportStatus = String(statusN.reportStatus || "");
    if (isInventoryComplete(result.content, lastReportStatus)) {
      inventoryDone = true;
      log(`盘点结束 (第 ${turn} 轮)`);
    }
  }

  if (!inventoryDone) {
    throw new Error(`达到最大轮次 ${maxTurns}，盘点仍未结束`);
  }

  // 4. 等待报告
  const finalStatus = await waitForReport(sessionId, headers);

  // 5. 写入报告
  const totalTurns = transcript.filter((t) => t.role === "user").length;
  writeReport({ userId, sessionId, totalTurns, finalStatus, transcript });

  log(`\n[PASS] 全流程通过! 共 ${totalTurns} 轮对话, 报告已就绪`);
  log("");
  log("============================================================");
  log("在微信开发者工具中查看报告：");
  log("1. 打开 调试器 → Storage → Local Storage");
  log("2. 把 opc_access_token 的值改为下面这串 token：");
  log("");
  log(`   ${accessToken}`);
  log("");
  log(`   userId: ${userId}`);
  log("3. 刷新小程序，进入「档案」页即可看到资产报告");
  log("============================================================");
}

function writeReport({ userId, sessionId, totalTurns, finalStatus, transcript }) {
  const lines = [
    "# Asset Report E2E Auto Test Report",
    "",
    `- Generated At: ${new Date().toISOString()}`,
    `- Base URL: \`${baseURL}\``,
    `- User ID: \`${userId}\``,
    `- Session ID: \`${sessionId}\``,
    `- Total Turns: ${totalTurns}`,
    `- Report Status: \`${finalStatus.reportStatus}\``,
    `- Report Version: \`${finalStatus.reportVersion}\``,
    `- Generated At: \`${finalStatus.lastReportAt}\``,
    "",
    "## 对话记录",
    ""
  ];

  for (const entry of transcript) {
    const prefix = entry.role === "user" ? "**用户**" : "**AI**";
    const dimTag = entry.dimension ? ` [${entry.dimension}]` : "";
    const actionTag = entry.routeAction ? ` (routeAction: ${entry.routeAction})` : "";
    lines.push(`### 第 ${entry.turn} 轮${dimTag}${actionTag}`);
    lines.push(`${prefix}:`);
    lines.push("");
    lines.push(entry.text.length > 500 ? entry.text.slice(0, 500) + "..." : entry.text);
    lines.push("");
  }

  lines.push("---");
  lines.push("");
  lines.push("*Auto-generated by asset-report-e2e-auto.js*");

  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, lines.join("\n"), "utf8");
  log(`测试报告已写入: ${reportPath}`);
}

main().catch((err) => {
  log(`\n[FAIL] ${err?.message || String(err)}`);
  if (err?.stack) log(err.stack);
  process.exitCode = 1;
});
