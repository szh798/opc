/**
 * Seed a local user with an asset report so the Mini Program profile UI can be
 * previewed without replaying the full asset-inventory conversation.
 *
 * Usage:
 *   cd backend && npm run dev:asset-report-ui-preview
 */

const fs = require("node:fs");
const path = require("node:path");
const axios = require("axios");
const { PrismaPg } = require("@prisma/adapter-pg");
const { PrismaClient, SnapshotKind } = require("@prisma/client");

require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const databaseUrl = String(process.env.DATABASE_URL || "").trim();
const { connectionString, schema } = resolveAdapterConnection(databaseUrl);
const prisma = new PrismaClient({
  adapter: new PrismaPg(
    {
      connectionString,
      application_name: "opc-asset-report-ui-preview",
      min: 1,
      max: 4,
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 30_000
    },
    schema ? { schema } : {}
  )
});
const baseURL = String(process.env.SMOKE_BASE_URL || "http://127.0.0.1:3000").replace(/\/+$/, "");
const samplePath = String(
  process.env.ASSET_REPORT_UI_SAMPLE_PATH ||
    path.join(__dirname, "..", "reports", "asset-report-generation-sample.md")
);
const snippetPath = String(
  process.env.ASSET_REPORT_UI_SNIPPET_PATH ||
    path.join(__dirname, "..", "reports", "asset-report-ui-preview-devtools.js")
);
const caseIndex = String(process.env.ASSET_REPORT_UI_CASE || "first").toLowerCase() === "review" ? 1 : 0;

function resolveAdapterConnection(rawDatabaseUrl) {
  assert(rawDatabaseUrl, "DATABASE_URL is not set");
  const parsed = new URL(rawDatabaseUrl);
  const schema = String(parsed.searchParams.get("schema") || "").trim();
  if (schema) {
    parsed.searchParams.delete("schema");
  }
  return {
    connectionString: parsed.toString(),
    schema
  };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function extractSampleReport() {
  assert(fs.existsSync(samplePath), `sample report not found: ${samplePath}`);
  const markdown = fs.readFileSync(samplePath, "utf8");
  const matches = [...markdown.matchAll(/### Sanitized Final Report\s*\n([\s\S]*?)(?:\n---\s*(?:\n|$)|$)/g)];
  const report = String(matches[caseIndex] && matches[caseIndex][1] ? matches[caseIndex][1] : "").trim();
  assert(report, `could not extract report case ${caseIndex} from ${samplePath}`);
  return report;
}

async function loginPreviewUser() {
  const response = await axios.post(
    `${baseURL}/auth/wechat-login`,
    {
      code: `asset-report-ui-preview-${Date.now()}`,
      nickname: "资产报告预览用户"
    },
    {
      timeout: 15000,
      validateStatus: () => true
    }
  );

  assert(response.status >= 200 && response.status < 300, `login failed: HTTP ${response.status} ${JSON.stringify(response.data)}`);
  const data = response.data || {};
  assert(data.accessToken, "login did not return accessToken");
  assert(data.user && data.user.id, "login did not return user.id");
  return data;
}

function buildPreviewSnapshot(user, finalReport) {
  const now = new Date().toISOString();

  return {
    version: "asset_inventory_v1",
    profileName: user.nickname || user.name || "资产报告预览用户",
    stageLabel: "资产盘点已完成",
    summary: "本地 UI 预览数据：用于查看资产报告在个人档案页中的展示效果。",
    radar: [
      { label: "能力", value: 78 },
      { label: "资源", value: 62 },
      { label: "认知", value: 74 },
      { label: "关系", value: 55 }
    ],
    strengths: [
      { label: "产品技术闭环", tone: "purple" },
      { label: "AI 应用落地", tone: "green" },
      { label: "内容驱动验证", tone: "blue" }
    ],
    traits: [
      { label: "战略", tone: "purple" },
      { label: "行动", tone: "green" },
      { label: "学习", tone: "blue" }
    ],
    ikigai: "把产品判断、技术实现和真实用户反馈接成低成本验证闭环。",
    assetDimensions: {
      ability: {
        score: 78,
        status: "较强",
        assets: ["产品设计", "前端落地", "AI 工具集成"],
        evidence: ["有完整项目闭环和真实交付样本"],
        monetization: "适合优先验证产品化服务",
        nextGap: ["补足定价和销售证据"]
      },
      resource: {
        score: 62,
        status: "可用",
        assets: ["技术内容受众", "小程序产品雏形", "Dify 工作流"],
        evidence: ["已有内容渠道和可演示产品"],
        monetization: "适合转入小范围试用名单",
        nextGap: ["筛选高意向付费用户"]
      },
      cognition: {
        score: 74,
        status: "较强",
        assets: ["低成本验证意识", "AI 工作流判断", "B 端 SaaS 理解"],
        evidence: ["能主动砍掉非闭环功能"],
        monetization: "适合做诊断加陪跑",
        nextGap: ["避免方向过多导致分散"]
      },
      relationship: {
        score: 55,
        status: "待激活",
        assets: ["前同事 CTO", "早期投资人 warm connection", "同频开发者"],
        evidence: ["可用于反馈、介绍和早期验证"],
        monetization: "适合先换真实反馈而非直接融资",
        nextGap: ["建立持续跟进节奏"]
      }
    },
    flowState: {
      conversationId: `asset-report-ui-preview-${Date.now()}`,
      inventoryStage: "report_generated",
      reviewStage: "",
      profileSnapshot: "【能力资产】产品设计、前端工程、AI 应用集成\n【资源资产】技术博客、小程序产品、Dify 工作流\n【认知资产】低成本验证、AI 工作流判断\n【关系资产】前同事 CTO、潜在合伙人、投资人 warm connection",
      dimensionReports: "## 能力维度\n产品技术闭环强。\n## 资源维度\n内容受众和产品雏形可用。\n## 认知维度\n具备商业验证意识。\n## 关系维度\n需要把弱连接转成真实反馈。",
      nextQuestion: "",
      changeSummary: "",
      reportBrief: "本地 UI 预览数据，用于查看个人档案页的资产报告卡片。",
      finalReport,
      reportVersion: caseIndex === 1 ? "2" : "1",
      lastReportGeneratedAt: now,
      reportStatus: "ready",
      reportError: "",
      assetWorkflowKey: caseIndex === 1 ? "reviewUpdate" : "firstInventory",
      isReview: caseIndex === 1 ? "true" : "false",
      syncedAt: now
    },
    flowSections: {
      profileSnapshot: {},
      dimensionReports: {},
      finalReport: {}
    },
    sourceDigest: {
      latestUserMessage: "资产报告 UI 预览",
      latestFeedbackSummary: "",
      latestTaskLabel: "",
      recentUserQuotes: []
    }
  };
}

async function seedSnapshot(user, finalReport) {
  await prisma.user.update({
    where: { id: user.id },
    data: {
      nickname: user.nickname || user.name || "资产报告预览用户",
      name: user.name || user.nickname || "资产报告预览用户",
      initial: "资",
      stage: "资产盘点已完成",
      streakDays: 7,
      hasAssetRadar: true
    }
  });

  await prisma.reportSnapshot.upsert({
    where: {
      userId_kind: {
        userId: user.id,
        kind: SnapshotKind.ASSET_INVENTORY
      }
    },
    create: {
      userId: user.id,
      kind: SnapshotKind.ASSET_INVENTORY,
      data: buildPreviewSnapshot(user, finalReport)
    },
    update: {
      data: buildPreviewSnapshot(user, finalReport)
    }
  });
}

function printDevtoolsSnippet(loginResult) {
  const user = loginResult.user || {};
  const runtimeBaseURL = baseURL;
  const snippet = [
    `wx.setStorageSync("opc_access_token", ${JSON.stringify(loginResult.accessToken)});`,
    `wx.setStorageSync("opc_refresh_token", ${JSON.stringify(loginResult.refreshToken || "")});`,
    "const app = getApp();",
    `app.globalData.runtimeConfig = { ...app.globalData.runtimeConfig, baseURL: ${JSON.stringify(runtimeBaseURL)}, useMock: false };`,
    `app.globalData.user = { ...app.globalData.user, ${Object.entries({
      id: user.id,
      name: user.name || user.nickname || "资产报告预览用户",
      nickname: user.nickname || user.name || "资产报告预览用户",
      initial: "资",
      loggedIn: true,
      loginMode: user.loginMode || "mock-wechat",
      stage: "资产盘点已完成",
      streakDays: 7
    })
      .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
      .join(", ")} };`,
    `wx.reLaunch({ url: "/pages/profile/profile" });`
  ].join("\n");

  fs.mkdirSync(path.dirname(snippetPath), { recursive: true });
  fs.writeFileSync(snippetPath, `${snippet}\n`, "utf8");

  console.log(`Snippet written to: ${snippetPath}`);
  console.log("\nPaste this in WeChat DevTools Console:");
  console.log("```js");
  console.log(snippet);
  console.log("```");
}

async function main() {
  console.log(`Backend base URL: ${baseURL}`);
  console.log(`Sample report: ${samplePath}`);
  const finalReport = extractSampleReport();
  const loginResult = await loginPreviewUser();
  await seedSnapshot(loginResult.user, finalReport);
  console.log(`Seeded user: ${loginResult.user.id}`);
  printDevtoolsSnippet(loginResult);
}

main()
  .catch((error) => {
    console.error(error && error.message ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
