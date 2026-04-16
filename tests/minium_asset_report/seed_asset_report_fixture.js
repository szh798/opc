const path = require("path");

const backendDir = path.resolve(__dirname, "../../backend");
require(path.join(backendDir, "node_modules", "dotenv")).config({
  path: path.join(backendDir, ".env")
});

const { PrismaClient } = require(path.join(backendDir, "node_modules", "@prisma", "client"));

const prisma = new PrismaClient();

const userId = String(process.env.OPC_SEED_USER_ID || "").trim();
const sessionId = String(process.env.OPC_SEED_SESSION_ID || "minium-render-session").trim();
const now = new Date().toISOString();

if (!userId) {
  throw new Error("OPC_SEED_USER_ID is required");
}

const profileSnapshot = [
  "【能力资产】",
  "- 能把模糊产品想法拆成页面、组件、接口、状态机和用户流程。",
  "- 能独立搭建小程序前端、NestJS 后端、Prisma、PostgreSQL 和 Dify 工作流。",
  "【资源资产】",
  "- 已经有接近可运行的一树 OPC 项目、真实 API key、本地开发环境和测试脚本。",
  "- 有完整产品文档、架构文档、资产盘点 DSL 和提示词。",
  "【认知资产】",
  "- 相信一人公司的核心是资产复用、自动化、低成本验证和持续交付。",
  "- 能把聊天产品设计成状态、触发条件、交付物和下一步行动。",
  "【关系资产】",
  "- 能接触创业者、产品人、开发者、自由职业者和想做副业的人。",
  "- 可以找熟人试用一树 OPC，收集第一批真实反馈。"
].join("\n");

const dimensionReports = [
  "【能力资产小报告】",
  "- 已识别资产：产品拆解、工程落地、Dify 工作流接入、问题定位。",
  "- 变现线索：小程序 MVP、自动化工作流搭建、AI 产品顾问。",
  "- 下一步：把当前项目整理成一个可展示案例。",
  "【资源资产小报告】",
  "- 可调用资源：OPC 代码库、数据库、真实 key、测试环境和产品资料。",
  "- 变现线索：将开发过程、踩坑过程和方法论沉淀为服务包。",
  "- 下一步：梳理一个最小服务清单。",
  "【认知资产小报告】",
  "- 独特判断：AI 产品价值不止聊天，而是关键节点产出报告、计划和判断。",
  "- 变现线索：围绕一人公司资产盘点建立方法论。",
  "- 下一步：用真实用户反馈校准报告结构。",
  "【关系资产小报告】",
  "- 信任网络：创业者、产品人、开发者、自由职业者和副业人群。",
  "- 变现线索：熟人试用、案例共创、轻咨询和产品化服务。",
  "- 下一步：邀请 3 个种子用户完成一次资产盘点。"
].join("\n");

const finalReport = [
  "【能力资产小报告】",
  "- 你的强项是把想法拆成可执行系统，并能亲自完成前后端、数据库和工作流集成。",
  "- 适合先卖小而清楚的交付：MVP 梳理、Dify 工作流接入、小程序闭环验证。",
  "【资源资产小报告】",
  "- 你已经拥有可演示项目、真实开发环境、产品文档和测试脚本，这些都是可复用资产。",
  "- 下一步要把资源从“自己能用”变成“别人看得懂、买得起、愿意试”。",
  "【认知资产小报告】",
  "- 你的关键判断是：一人公司不是拼时间，而是把能力资产化、流程自动化、交付标准化。",
  "- 这套判断可以沉淀成内容、咨询框架和工具模板。",
  "【关系资产小报告】",
  "- 你可以优先触达创业者、产品人、独立开发者和副业探索者。",
  "- 第一批用户不需要很多，关键是完成真实反馈和案例复盘。",
  "【总资产报告】",
  "- 当前最值得推进的方向：围绕 AI 工具 + 小程序 + 自动化工作流，提供轻咨询和产品化交付。",
  "- 48 小时行动：整理 1 个案例页、约 3 个种子用户、跑通一次完整资产盘点并记录反馈。",
  "- 风险提醒：先不要做大而全平台，优先验证用户是否愿意为清晰诊断和落地方案付费。"
].join("\n");

const reportBrief = "四维资产已经成型：能力资产偏工程落地，资源资产来自 OPC 项目，认知资产是资产复用方法论，关系资产适合从熟人试用切入。";

async function main() {
  const current = await prisma.reportSnapshot.findUnique({
    where: {
      userId_kind: {
        userId,
        kind: "ASSET_INVENTORY"
      }
    }
  });
  const currentData = current && current.data && typeof current.data === "object" ? current.data : {};
  const flowState = {
    ...(currentData.flowState && typeof currentData.flowState === "object" ? currentData.flowState : {}),
    conversationId: sessionId,
    inventoryStage: "report_generated",
    reviewStage: "",
    profileSnapshot,
    dimensionReports,
    nextQuestion: "",
    changeSummary: "",
    reportBrief,
    finalReport,
    reportVersion: "1",
    lastReportGeneratedAt: now,
    reportStatus: "ready",
    reportError: "",
    assetWorkflowKey: "firstInventory",
    isReview: "false",
    syncedAt: now
  };
  const data = {
    ...currentData,
    flowState,
    flowSections: {
      profileSnapshot: {
        "能力资产": ["能拆系统", "能落地工程"],
        "资源资产": ["OPC 项目", "真实开发环境"],
        "认知资产": ["资产复用", "自动化交付"],
        "关系资产": ["种子用户", "同频开发者"]
      },
      dimensionReports: {
        "能力资产小报告": ["产品拆解", "工程落地"],
        "资源资产小报告": ["OPC 代码库", "测试环境"],
        "认知资产小报告": ["一人公司方法论", "AI 产品判断"],
        "关系资产小报告": ["熟人试用", "案例共创"]
      },
      finalReport: {
        "能力资产小报告": ["系统拆解和工程实现"],
        "资源资产小报告": ["项目和文档可复用"],
        "认知资产小报告": ["资产化与自动化"],
        "关系资产小报告": ["种子用户切入"],
        "总资产报告": ["先卖小闭环服务"]
      }
    }
  };

  await prisma.reportSnapshot.upsert({
    where: {
      userId_kind: {
        userId,
        kind: "ASSET_INVENTORY"
      }
    },
    create: {
      userId,
      kind: "ASSET_INVENTORY",
      data
    },
    update: {
      data
    }
  });
}

main()
  .then(() => {
    console.log(JSON.stringify({ ok: true, userId, sessionId }));
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
