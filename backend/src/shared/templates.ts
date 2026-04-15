import { Prisma } from "@prisma/client";
import { DEMO_USER_ID } from "./catalog";

export const DEMO_USER_TEMPLATE = {
  id: DEMO_USER_ID,
  name: "小明",
  nickname: "小明",
  initial: "小",
  stage: "资产探索期",
  streakDays: 12,
  subtitle: "点击查看我的档案",
  loggedIn: false,
  loginMode: "",
  avatarUrl: ""
};

export const DEFAULT_PROFILE_DATA: Prisma.JsonObject = {
  initial: "小",
  name: "小明",
  stageLabel: "资产探索期 · 连续打卡 12 天",
  byline: "来自 一树·挖宝",
  radar: [
    { label: "能力", value: 76 },
    { label: "资源", value: 34 },
    { label: "认知", value: 82 },
    { label: "关系", value: 49 }
  ],
  strengths: ["深度数据分析", "B2B销售经验", "跨境电商认知"],
  traits: [
    { label: "战略思维主导", tone: "mint" },
    { label: "分析", tone: "blue" },
    { label: "学习", tone: "sky" },
    { label: "成就", tone: "gold" }
  ],
  ikigai: "帮助中小企业用数据分析提升决策质量。你擅长，热爱，世界需要，而且有人愿意付费。"
};

export const DEFAULT_ASSET_INVENTORY_DATA: Prisma.JsonObject = {
  version: "asset_inventory_v1",
  profileName: "小明",
  stageLabel: "资产探索期",
  summary: "当前还处在资产探索期，先从真实案例里提炼能力、资源、认知和关系资产。",
  radar: [
    { label: "能力", value: 36 },
    { label: "资源", value: 24 },
    { label: "认知", value: 32 },
    { label: "关系", value: 18 }
  ],
  strengths: ["问题拆解", "执行推进"],
  traits: [
    { label: "稳步积累", tone: "mint" },
    { label: "耐心推进", tone: "gold" }
  ],
  ikigai: "先把真实案例讲清楚，再把已经发生过的价值转成可复用资产。",
  realCases: [],
  assetDimensions: {
    ability: {
      score: 36,
      status: "待确认",
      assets: [],
      evidence: [],
      monetization: "待确认",
      nextGap: ["补充一个你亲自完成且有结果的案例"]
    },
    resource: {
      score: 24,
      status: "待确认",
      assets: [],
      evidence: [],
      monetization: "待确认",
      nextGap: ["补充可直接调用的人脉、渠道、资源或组织支持"]
    },
    cognition: {
      score: 32,
      status: "待确认",
      assets: [],
      evidence: [],
      monetization: "待确认",
      nextGap: ["补充你对行业、本质问题或解法的独特判断"]
    },
    relationship: {
      score: 18,
      status: "待确认",
      assets: [],
      evidence: [],
      monetization: "待确认",
      nextGap: ["补充哪些人愿意信任你、转介绍你或为你打开第一单"]
    }
  },
  fourCircleSignals: {
    love: [],
    goodAt: ["问题拆解"],
    worldNeeds: [],
    willingToPay: []
  },
  monetizationJudgement: {
    strongAssets: [],
    potentialAssets: ["问题拆解"],
    weakOrMisjudged: ["兴趣、努力、学历本身不算核心资产"],
    nextToVerify: ["是否已有真实需求方、真实结果和可直接调动的资源"]
  },
  evidenceQuotes: [],
  pendingQuestions: ["请补充一个真实案例，包含场景、动作和结果"],
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
  phase: "播种期",
  progressLabel: "你的一树已成长到第2阶段 · 发芽期",
  hint: "点击里程碑可回看关键成果",
  ctaText: "回到对话继续"
};

export const DEFAULT_GROWTH_MILESTONES: Prisma.JsonArray = [
  { id: "m1", title: "完成资产盘点", date: "3月28日", leaves: "2片叶子", meta: "3月28日 · 2片叶子", status: "done", artifactTitle: "资产雷达图" },
  { id: "m2", title: "锁定商业方向", date: "3月29日", leaves: "1片叶子", meta: "3月29日 · 1片叶子", status: "done", artifactTitle: "定位语句" },
  { id: "m3", title: "完成客户验证", date: "4月2日", leaves: "3片叶子", meta: "4月2日 · 3片叶子", status: "done", artifactTitle: "验证记录" },
  { id: "m4", title: "通过继续/停止决策", date: "4月5日", leaves: "1片叶子", meta: "4月5日 · 1片叶子", status: "done", artifactTitle: "决策单" },
  { id: "m5", title: "拿下第一单", date: "进行中", leaves: "", meta: "进行中...", status: "current", artifactTitle: "首单复盘" },
  { id: "m6", title: "完成产品化", date: "待解锁", leaves: "", meta: "待解锁", status: "todo" },
  { id: "m7", title: "建立三层定价", date: "待解锁", leaves: "", meta: "待解锁", status: "todo" },
  { id: "m8", title: "月入稳定", date: "待解锁", leaves: "", meta: "待解锁", status: "todo" }
] as unknown as Prisma.JsonArray;

export const DEFAULT_CURRENT_MILESTONE: Prisma.JsonObject = {
  title: "里程碑解锁",
  unlocked: "拿下第一单",
  copy: "第一块钱永远是最难的，你已经赚到了。后面的路比你想象的简单。",
  primaryText: "看看我的树",
  secondaryText: "分享成就",
  followup: "你的树又长出一根新枝了。接下来我帮你把这个服务产品化，让它可以批量复制。"
};

export const DEFAULT_WEEKLY_REPORT: Prisma.JsonObject = {
  period: "3.25-3.31",
  headline: "周日了，看看你这周的成绩单：",
  stats: [
    { label: "完成任务", value: "12", extra: "/15" },
    { label: "客户触达", value: "23" },
    { label: "本周收入", value: "+2,999", tone: "positive" },
    { label: "树的成长", value: "+2叶", tone: "asset" }
  ],
  comment: "任务完成率80%，节奏在上升。最大损耗还在客户跟进，3个意向客户超过48小时没回访。",
  comparison: "较上周：任务 +3 收入 +999",
  primaryText: "晒周报"
};

export const DEFAULT_MONTHLY_REPORT: Prisma.JsonObject = {
  title: "3月商业体检",
  intro: "每月1号，例行体检时间。这是你3月份的商业健康报告：",
  metrics: [
    { label: "月收入", value: "8,997 元", accent: "+45%", tone: "positive" },
    { label: "客户数", value: "3 个付费", tone: "neutral" },
    { label: "转化率", value: "12%", tone: "neutral" },
    { label: "任务完成率", value: "72%", tone: "warn" },
    { label: "利润账户余额", value: "2,699 元", tone: "positive" }
  ],
  advice: "收入在增长，但全靠新客。需要尽快设计一个复购机制。下个月重点把3个付费客户变成月度订阅。",
  primaryText: "晒月报"
};

export const DEFAULT_SOCIAL_PROOF: Prisma.JsonObject = {
  inactiveDays: 5,
  headline: "你已经5天没打开了。你的树停止生长了。",
  proofTitle: "同路人数据",
  proof: "本周有 38 个人跟你处在同一阶段。其中 12 个已经完成了客户验证，3 个拿到了第一单。",
  proofStats: [
    { label: "同阶段", value: "38人", tone: "normal" },
    { label: "完成验证", value: "12人", tone: "up" },
    { label: "拿到首单", value: "3人", tone: "up" }
  ],
  nudge: "你不是没时间，你是在等一个不会来的“准备好了”。要不要现在就做一件事？就一件。",
  primaryText: "好，给我一个任务",
  secondaryText: "我确实有困难，聊聊"
};

export const DEFAULT_SHARE_PREVIEW: Prisma.JsonObject = {
  subtitle: "一树OPC / 我的资产雷达",
  title: "原来我的隐藏资产\n比我想的多得多。",
  quote: "扫码发现你的隐藏资产",
  brand: "一树OPC",
  createdAt: "3月31日生成",
  bars: [
    { label: "能力", value: 78 },
    { label: "资源", value: 42 },
    { label: "认知", value: 86 },
    { label: "关系", value: 55 }
  ],
  caption: "今天用一树OPC把资产盘点了一遍，发现了之前没意识到的变现路径。",
  hashtags: ["#一人公司", "#AI搞钱", "#生意复盘"]
};

export const DEFAULT_DAILY_TASKS = [
  { id: "task-1", label: "触达5个潜在客户", tag: "自媒体项目" },
  { id: "task-2", label: "发一条小红书", tag: "IP杠杆" },
  { id: "task-3", label: "跟进昨天的意向客户", tag: "自媒体项目" }
];
