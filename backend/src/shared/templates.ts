import { Prisma } from "@prisma/client";

export const DEFAULT_USER_TEMPLATE = {
  name: "",
  nickname: "",
  initial: "",
  stage: "",
  streakDays: 0,
  subtitle: "点击查看我的档案",
  loggedIn: false,
  loginMode: "",
  avatarUrl: ""
};

export const DEFAULT_PROFILE_DATA: Prisma.JsonObject = {
  initial: "",
  name: "",
  stageLabel: "",
  byline: "来自 一树·挖宝",
  radar: [
    { label: "能力", value: 0 },
    { label: "资源", value: 0 },
    { label: "认知", value: 0 },
    { label: "关系", value: 0 }
  ],
  strengths: [],
  traits: [],
  ikigai: "",
  profileMeta: {
    phase: "empty",
    visibility: {
      radar: false,
      strengths: false,
      traits: false,
      ikigai: false
    },
    evidence: {
      userFactCount: 0,
      factDimensions: [],
      hasAssetFlowSnapshot: false,
      hasAssetReport: false
    },
    generation: {
      strengths: "none",
      traits: "none",
      ikigai: "none"
    },
    hint: "先聊几轮，档案还没开始积累。"
  }
};

export const DEFAULT_ASSET_INVENTORY_DATA: Prisma.JsonObject = {
  version: "asset_inventory_v1",
  profileName: "",
  stageLabel: "",
  summary: "当前还没有足够信息生成资产盘点。",
  radar: [
    { label: "能力", value: 0 },
    { label: "资源", value: 0 },
    { label: "认知", value: 0 },
    { label: "关系", value: 0 }
  ],
  strengths: [],
  traits: [],
  ikigai: "",
  realCases: [],
  assetDimensions: {
    ability: {
      score: 0,
      status: "待确认",
      assets: [],
      evidence: [],
      monetization: "待确认",
      nextGap: []
    },
    resource: {
      score: 0,
      status: "待确认",
      assets: [],
      evidence: [],
      monetization: "待确认",
      nextGap: []
    },
    cognition: {
      score: 0,
      status: "待确认",
      assets: [],
      evidence: [],
      monetization: "待确认",
      nextGap: []
    },
    relationship: {
      score: 0,
      status: "待确认",
      assets: [],
      evidence: [],
      monetization: "待确认",
      nextGap: []
    }
  },
  fourCircleSignals: {
    love: [],
    goodAt: [],
    worldNeeds: [],
    willingToPay: []
  },
  monetizationJudgement: {
    strongAssets: [],
    potentialAssets: [],
    weakOrMisjudged: [],
    nextToVerify: []
  },
  evidenceQuotes: [],
  pendingQuestions: [],
  flowState: {
    conversationId: "",
    inventoryStage: "",
    reviewStage: "",
    profileSnapshot: "",
    dimensionReports: "",
    nextQuestion: "",
    changeSummary: "",
    reportBrief: "",
    finalReport: "",
    reportVersion: "",
    lastReportGeneratedAt: "",
    reportStatus: "idle",
    reportError: "",
    assetWorkflowKey: "",
    isReview: "",
    syncedAt: ""
  },
  flowSections: {
    profileSnapshot: {},
    dimensionReports: {},
    finalReport: {}
  },
  sourceDigest: {
    latestUserMessage: "",
    latestFeedbackSummary: "",
    latestTaskLabel: "",
    recentUserQuotes: []
  }
};

export const DEFAULT_GROWTH_OVERVIEW: Prisma.JsonObject = {
  title: "我的一树",
  phase: "",
  progressLabel: "",
  hint: "成长树功能仍在开发中",
  ctaText: "回到对话继续"
};

export const DEFAULT_GROWTH_MILESTONES: Prisma.JsonArray = [
  { id: "m1", title: "完成资产盘点", date: "", leaves: "", meta: "待解锁", status: "todo", artifactTitle: "" },
  { id: "m2", title: "锁定商业方向", date: "", leaves: "", meta: "待解锁", status: "todo", artifactTitle: "" },
  { id: "m3", title: "完成客户验证", date: "", leaves: "", meta: "待解锁", status: "todo", artifactTitle: "" },
  { id: "m4", title: "通过继续/停止决策", date: "", leaves: "", meta: "待解锁", status: "todo", artifactTitle: "" },
  { id: "m5", title: "拿下第一单", date: "", leaves: "", meta: "待解锁", status: "todo", artifactTitle: "" },
  { id: "m6", title: "完成产品化", date: "", leaves: "", meta: "待解锁", status: "todo", artifactTitle: "" },
  { id: "m7", title: "建立三层定价", date: "", leaves: "", meta: "待解锁", status: "todo", artifactTitle: "" },
  { id: "m8", title: "月入稳定", date: "", leaves: "", meta: "待解锁", status: "todo", artifactTitle: "" }
] as unknown as Prisma.JsonArray;

export const DEFAULT_CURRENT_MILESTONE: Prisma.JsonObject = {
  title: "里程碑功能开发中",
  unlocked: "",
  copy: "继续推进真实对话和任务，后续会在这里展示关键阶段成果。",
  primaryText: "回到对话",
  secondaryText: "分享成就",
  followup: "里程碑开放后，你的重要进展会自动沉淀在这里。"
};

export const DEFAULT_WEEKLY_REPORT: Prisma.JsonObject = {
  period: "",
  headline: "本周还没有足够数据生成周报。",
  stats: [],
  comment: "完成几次真实任务和对话后，这里会自动汇总你的周节奏。",
  comparison: "",
  primaryText: "晒周报"
};

export const DEFAULT_MONTHLY_REPORT: Prisma.JsonObject = {
  title: "本月商业体检",
  intro: "当前还没有足够数据生成商业健康报告。",
  metrics: [],
  advice: "继续完成真实动作后，这里会给出你的月度经营反馈。",
  primaryText: "晒月报"
};

export const DEFAULT_SOCIAL_PROOF: Prisma.JsonObject = {
  inactiveDays: 0,
  headline: "当前还没有足够数据生成社会证明。",
  proofTitle: "同路人数据",
  proof: "继续推进真实动作后，这里会显示阶段反馈和社会证明。",
  proofStats: [],
  nudge: "先回到对话继续推进一轮。",
  primaryText: "好，给我一个任务",
  secondaryText: "我确实有困难，聊聊"
};

export const DEFAULT_SHARE_PREVIEW: Prisma.JsonObject = {
  subtitle: "",
  title: "",
  quote: "",
  brand: "一树OPC",
  createdAt: "",
  bars: [],
  caption: "",
  hashtags: []
};

export const DEFAULT_DAILY_TASKS = [
  { id: "task-1", label: "触达5个潜在客户", tag: "自媒体项目" },
  { id: "task-2", label: "发一条小红书", tag: "IP杠杆" },
  { id: "task-3", label: "跟进昨天的意向客户", tag: "自媒体项目" }
];
