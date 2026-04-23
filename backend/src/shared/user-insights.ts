import { MessageRole } from "@prisma/client";
import { PrismaService } from "./prisma.service";

const STAGE_SEQUENCE = [
  "资产探索期",
  "商业定位期",
  "机会验证期",
  "决策推进期",
  "首单冲刺期",
  "产品化期",
  "定价优化期",
  "稳定增长期"
];

type InsightArtifact = {
  id: string;
  type: string;
  title: string;
  meta: string;
  summary: string;
  updatedAt: Date;
  scores: Array<{ label: string; percent: number; value: string; warn: boolean }>;
  tiers: Array<{ label: string; price: string; active: boolean }>;
  body: string[];
};

type InsightProject = {
  id: string;
  name: string;
  phase: string;
  status: string;
  updatedAt: Date;
  artifacts: InsightArtifact[];
};

type InsightCounters = {
  completedTasks: number;
  feedbacks: number;
  userMessages: number;
  projectChats: number;
  artifacts: number;
  activeDays: number;
};

export type UserInsights = {
  displayName: string;
  stageLabel: string;
  stageIndex: number;
  byline: string;
  radar: Array<{ label: string; value: number }>;
  strengths: string[];
  traits: Array<{ label: string; tone: string }>;
  ikigai: string;
  latestUserMessage: string;
  latestFeedbackSummary: string;
  latestTaskLabel: string;
  recentUserMessages: string[];
  latestArtifact: InsightArtifact | null;
  activeProject: InsightProject | null;
  inactiveDays: number;
  lastActivityAt: Date | null;
  totalTasks: number;
  totalArtifacts: number;
  totalProjects: number;
  weekly: InsightCounters;
  previousWeek: InsightCounters;
  monthly: InsightCounters;
};

export async function collectUserInsights(prisma: PrismaService, userId: string): Promise<UserInsights> {
  const now = new Date();
  const weekStart = shiftDays(now, -6);
  const prevWeekStart = shiftDays(now, -13);
  const prevWeekEnd = shiftDays(now, -7);
  const monthStart = shiftDays(now, -29);

  const user = await prisma.user.findUnique({
    where: {
      id: userId
    },
    select: {
      id: true,
      name: true,
      nickname: true,
      initial: true,
      stage: true,
      streakDays: true
    }
  });
  const messages = await prisma.message.findMany({
    where: {
      userId,
      role: MessageRole.USER
    },
    orderBy: {
      createdAt: "asc"
    },
    select: {
      text: true,
      createdAt: true,
      conversationId: true
    }
  });
  const tasks = await prisma.dailyTask.findMany({
    where: {
      userId
    },
    orderBy: {
      updatedAt: "asc"
    },
    select: {
      label: true,
      done: true,
      completedAt: true,
      updatedAt: true
    }
  });
  const feedbacks = await prisma.taskFeedback.findMany({
    where: {
      userId
    },
    orderBy: {
      createdAt: "asc"
    },
    select: {
      summary: true,
      advice: true,
      createdAt: true
    }
  });
  const projects = await prisma.project.findMany({
    where: {
      userId,
      deletedAt: null
    },
    orderBy: {
      updatedAt: "desc"
    },
    include: {
      artifacts: {
        where: {
          deletedAt: null
        },
        orderBy: {
          updatedAt: "desc"
        }
      }
    }
  });
  const projectChats = await prisma.conversation.findMany({
    where: {
      userId,
      deletedAt: null,
      id: {
        startsWith: "project-chat-"
      }
    },
    orderBy: {
      updatedAt: "asc"
    },
    select: {
      updatedAt: true
    }
  });

  const displayName = String(user?.nickname || user?.name || "访客").trim() || "访客";
  const stageLabel = String(user?.stage || "").trim() || inferStageLabel(tasks, feedbacks, projects);
  const stageIndex = resolveStageIndex(stageLabel);

  const normalizedProjects = projects.map<InsightProject>((project) => ({
    id: project.id,
    name: project.name,
    phase: String(project.phase || "").trim(),
    status: String(project.status || "").trim(),
    updatedAt: project.updatedAt,
    artifacts: project.artifacts.map((artifact) => normalizeArtifact({
      id: artifact.id,
      type: artifact.type,
      title: artifact.title,
      data: artifact.data,
      meta: artifact.meta,
      summary: artifact.summary,
      updatedAt: artifact.updatedAt
    }))
  }));
  const artifacts = normalizedProjects.flatMap((project) => project.artifacts);
  const latestArtifact = artifacts[0] || null;
  const activeProject = normalizedProjects[0] || null;
  const latestUserMessage = String(messages[messages.length - 1]?.text || "").trim();
  const recentUserMessages = messages
    .map((item) => String(item.text || "").trim())
    .filter(Boolean)
    .slice(-6);
  const latestFeedbackSummary = String(feedbacks[feedbacks.length - 1]?.summary || "").trim();
  const latestTaskLabel = String(
    tasks
      .filter((task) => task.done)
      .slice(-1)[0]?.label || ""
  ).trim();
  const lastActivityAt = maxDate([
    messages[messages.length - 1]?.createdAt || null,
    tasks.filter((task) => task.done).slice(-1)[0]?.completedAt || null,
    feedbacks[feedbacks.length - 1]?.createdAt || null,
    projectChats[projectChats.length - 1]?.updatedAt || null,
    artifacts[0]?.updatedAt || null
  ]);
  const inactiveDays = lastActivityAt ? Math.max(0, diffDays(lastActivityAt, now)) : 99;

  const weekly = buildCounters({
    tasks,
    feedbacks,
    messages,
    projectChats,
    artifacts,
    dateFrom: weekStart,
    dateTo: now
  });
  const previousWeek = buildCounters({
    tasks,
    feedbacks,
    messages,
    projectChats,
    artifacts,
    dateFrom: prevWeekStart,
    dateTo: prevWeekEnd
  });
  const monthly = buildCounters({
    tasks,
    feedbacks,
    messages,
    projectChats,
    artifacts,
    dateFrom: monthStart,
    dateTo: now
  });

  const radar = buildRadar({
    stageIndex,
    totalArtifacts: artifacts.length,
    totalProjects: normalizedProjects.length,
    weekly,
    monthly
  });
  const strengths = buildStrengths({
    stageIndex,
    artifacts,
    weekly,
    monthly,
    latestUserMessage
  });
  const traits = buildTraits({
    weekly,
    monthly,
    totalArtifacts: artifacts.length
  });
  const byline = resolveByline(stageIndex);
  const ikigai = buildIkigai({
    displayName,
    activeProject,
    strengths,
    stageLabel,
    latestArtifact,
    weekly,
    monthly,
    totalProjects: normalizedProjects.length
  });

  return {
    displayName,
    stageLabel,
    stageIndex,
    byline,
    radar,
    strengths,
    traits,
    ikigai,
    latestUserMessage,
    latestFeedbackSummary,
    latestTaskLabel,
    recentUserMessages,
    latestArtifact,
    activeProject,
    inactiveDays,
    lastActivityAt,
    totalTasks: tasks.length,
    totalArtifacts: artifacts.length,
    totalProjects: normalizedProjects.length,
    weekly,
    previousWeek,
    monthly
  };
}

export function buildDynamicProfile(insights: UserInsights, fallback: Record<string, unknown>) {
  return {
    ...fallback,
    byline: insights.byline,
    radar: insights.radar,
    strengths: insights.strengths,
    traits: insights.traits,
    ikigai: insights.ikigai,
    stageLabel: buildStageLabel(insights.stageLabel, fallback.stageLabel),
    growthSummary: buildProfileGrowthSummary(insights)
  };
}

export function buildAssetInventorySnapshot(
  insights: UserInsights,
  profile: Record<string, unknown>
) {
  const evidenceQuotes = collectEvidenceQuotes(insights);
  const realCases = buildRealCases(evidenceQuotes);
  const abilityAssets = collectAbilityAssets(insights, evidenceQuotes);
  const resourceAssets = collectResourceAssets(insights, evidenceQuotes);
  const cognitionAssets = collectCognitionAssets(insights, evidenceQuotes);
  const relationshipAssets = collectRelationshipAssets(insights, evidenceQuotes);
  const worldNeeds = collectWorldNeeds(insights, evidenceQuotes);
  const willingToPay = collectWillingToPay(insights, evidenceQuotes);
  const love = collectLoveSignals(evidenceQuotes);
  const scoreByLabel = toScoreMap(insights.radar);
  const pendingQuestions = compactUnique([
    buildPendingQuestion(abilityAssets.length, "继续补一个你亲自完成、可量化结果更明确的案例"),
    buildPendingQuestion(resourceAssets.length, "继续确认哪些资源离开学校或导师体系后仍然能直接调用"),
    buildPendingQuestion(cognitionAssets.length, "继续确认你对行业本质问题的独特判断"),
    buildPendingQuestion(relationshipAssets.length, "继续确认谁愿意信任你、转介绍你或帮你拿第一单"),
    !willingToPay.length ? "继续确认哪些需求方已经表现出付费意愿或明确预算" : ""
  ]);
  const strongAssets = compactUnique([
    ...abilityAssets.slice(0, scoreByLabel["能力"] >= 50 ? 2 : 1),
    ...(resourceAssets.length && scoreByLabel["资源"] >= 40 ? resourceAssets.slice(0, 1) : []),
    ...(cognitionAssets.length && scoreByLabel["认知"] >= 45 ? cognitionAssets.slice(0, 1) : [])
  ]).slice(0, 4);
  const potentialAssets = compactUnique([
    ...insights.strengths,
    ...abilityAssets,
    ...resourceAssets,
    ...cognitionAssets,
    ...relationshipAssets
  ])
    .filter((item) => !strongAssets.includes(item))
    .slice(0, 6);

  return {
    version: "asset_inventory_v1",
    generatedAt: new Date().toISOString(),
    profileName: insights.displayName,
    stageLabel: insights.stageLabel,
    summary: buildInventorySummary(insights, strongAssets, realCases.length),
    radar: insights.radar,
    strengths: insights.strengths,
    traits: insights.traits,
    ikigai: String(profile.ikigai || insights.ikigai || "").trim(),
    realCases,
    assetDimensions: {
      ability: buildDimensionSnapshot({
        score: scoreByLabel["能力"],
        assets: abilityAssets,
        evidence: evidenceQuotes,
        defaultGap: "继续补充能力如何跨场景复用，以及你亲自负责了哪些关键动作"
      }),
      resource: buildDimensionSnapshot({
        score: scoreByLabel["资源"],
        assets: resourceAssets,
        evidence: evidenceQuotes,
        defaultGap: "继续补充可直接调用的人脉、渠道、组织资源和落地资源"
      }),
      cognition: buildDimensionSnapshot({
        score: scoreByLabel["认知"],
        assets: cognitionAssets,
        evidence: evidenceQuotes,
        defaultGap: "继续补充你对行业问题、本质矛盾和解法路径的独特判断"
      }),
      relationship: buildDimensionSnapshot({
        score: scoreByLabel["关系"],
        assets: relationshipAssets,
        evidence: evidenceQuotes,
        defaultGap: "继续补充谁愿意持续信任你、介绍你、帮你拿到第一单"
      })
    },
    fourCircleSignals: {
      love,
      goodAt: insights.strengths,
      worldNeeds,
      willingToPay
    },
    monetizationJudgement: {
      strongAssets,
      potentialAssets,
      weakOrMisjudged: ["兴趣、努力、学历本身不算核心资产", "没有案例支撑的自我评价先不升级为核心资产"],
      nextToVerify: pendingQuestions.slice(0, 4)
    },
    evidenceQuotes,
    pendingQuestions,
    sourceDigest: {
      latestUserMessage: insights.latestUserMessage,
      latestFeedbackSummary: insights.latestFeedbackSummary,
      latestTaskLabel: insights.latestTaskLabel,
      recentUserQuotes: insights.recentUserMessages.slice(-4)
    }
  };
}

export function buildDynamicWeeklyReport(insights: UserInsights) {
  const period = buildPeriodLabel(6);
  const completedTaskTarget = Math.max(3, insights.totalTasks || 3);
  const stageText = insights.stageIndex > 0 ? `第${insights.stageIndex}阶段` : "播种中";
  const artifactDelta = insights.weekly.artifacts - insights.previousWeek.artifacts;

  return {
    period,
    headline: "这是你最近 7 天的推进成绩单：",
    stats: [
      { label: "完成任务", value: String(insights.weekly.completedTasks), extra: `/${completedTaskTarget}` },
      { label: "项目推进", value: `${insights.weekly.projectChats}轮` },
      { label: "新成果卡", value: `${insights.weekly.artifacts}张`, tone: insights.weekly.artifacts > 0 ? "positive" : "normal" },
      { label: "树的阶段", value: stageText, tone: "asset" }
    ],
    comment: buildWeeklyComment(insights),
    comparison: `较上周：任务 ${formatDiff(insights.weekly.completedTasks - insights.previousWeek.completedTasks)} / 成果 ${formatDiff(artifactDelta)}`,
    primaryText: "晒周报"
  };
}

export function buildDynamicMonthlyReport(insights: UserInsights) {
  const now = new Date();
  const monthTitle = `${now.getMonth() + 1}月商业体检`;
  const activeDelta = insights.monthly.activeDays - insights.previousWeek.activeDays;

  return {
    title: monthTitle,
    intro: "这是你最近 30 天的业务体检：",
    metrics: [
      { label: "活跃天数", value: `${insights.monthly.activeDays} 天`, accent: formatDiffWithUnit(activeDelta, "天"), tone: insights.monthly.activeDays >= 6 ? "positive" : "warn" },
      { label: "完成任务", value: `${insights.monthly.completedTasks} 项`, tone: insights.monthly.completedTasks >= 4 ? "positive" : "neutral" },
      { label: "项目推进", value: `${insights.monthly.projectChats} 轮`, tone: insights.monthly.projectChats >= 3 ? "positive" : "neutral" },
      { label: "生成成果卡", value: `${insights.monthly.artifacts} 张`, tone: insights.monthly.artifacts >= 2 ? "positive" : "neutral" },
      { label: "当前阶段", value: insights.stageLabel || "播种中", tone: "positive" }
    ],
    advice: buildMonthlyAdvice(insights),
    primaryText: "晒月报"
  };
}

export function buildDynamicSocialProof(insights: UserInsights) {
  const inactiveDays = insights.inactiveDays;
  const title = inactiveDays >= 3
    ? `你已经 ${inactiveDays} 天没有推进了。`
    : "你的节奏还在。再往前推一步，树就会继续长叶。";

  return {
    inactiveDays,
    headline: title,
    proofTitle: "最近7天进展",
    proof: `你最近 7 天完成了 ${insights.weekly.completedTasks} 项任务、推进了 ${insights.weekly.projectChats} 轮项目对话，并新增 ${insights.weekly.artifacts} 张成果卡。`,
    proofStats: [
      { label: "完成任务", value: `${insights.weekly.completedTasks}项`, tone: insights.weekly.completedTasks > 0 ? "up" : "normal" },
      { label: "项目推进", value: `${insights.weekly.projectChats}轮`, tone: insights.weekly.projectChats > 0 ? "up" : "normal" },
      { label: "新成果", value: `${insights.weekly.artifacts}张`, tone: insights.weekly.artifacts > 0 ? "up" : "normal" }
    ],
    nudge: buildSocialNudge(insights),
    primaryText: "好，给我一个任务",
    secondaryText: "我确实有困难，聊聊"
  };
}

export function buildDynamicSharePreview(
  insights: UserInsights,
  fallback: Record<string, unknown>,
  payload: Record<string, unknown> = {}
) {
  const baseTitle = readString(payload.title || payload.resultTitle, 120)
    || insights.latestArtifact?.title
    || `${insights.stageLabel || "成长阶段"}成果`;
  const quote = readString(payload.quote, 200)
    || insights.latestArtifact?.summary
    || buildShareQuote(insights);
  const bars = buildShareBars(insights, payload);
  const hashtags = buildHashtags(insights, payload);
  const activeProject = insights.activeProject?.name || "我的成长卡片";

  return {
    ...fallback,
    subtitle: `一树OPC / ${activeProject}`,
    title: prettifyShareTitle(baseTitle),
    quote,
    brand: "一树OPC",
    createdAt: `${formatMonthDay(new Date())}生成`,
    bars,
    caption: buildShareCaptionText(insights, baseTitle, quote),
    hashtags
  };
}

function buildCounters(input: {
  tasks: Array<{ done: boolean; completedAt: Date | null; updatedAt: Date }>;
  feedbacks: Array<{ createdAt: Date }>;
  messages: Array<{ createdAt: Date }>;
  projectChats: Array<{ updatedAt: Date }>;
  artifacts: InsightArtifact[];
  dateFrom: Date;
  dateTo: Date;
}): InsightCounters {
  const taskDates = input.tasks
    .filter((task) => task.done)
    .map((task) => task.completedAt || task.updatedAt)
    .filter((date): date is Date => date instanceof Date);
  const feedbackDates = input.feedbacks.map((item) => item.createdAt);
  const messageDates = input.messages.map((item) => item.createdAt);
  const projectChatDates = input.projectChats.map((item) => item.updatedAt);
  const artifactDates = input.artifacts.map((item) => item.updatedAt);

  return {
    completedTasks: countWithin(taskDates, input.dateFrom, input.dateTo),
    feedbacks: countWithin(feedbackDates, input.dateFrom, input.dateTo),
    userMessages: countWithin(messageDates, input.dateFrom, input.dateTo),
    projectChats: countWithin(projectChatDates, input.dateFrom, input.dateTo),
    artifacts: countWithin(artifactDates, input.dateFrom, input.dateTo),
    activeDays: countActiveDays(
      taskDates.concat(feedbackDates, messageDates, projectChatDates, artifactDates),
      input.dateFrom,
      input.dateTo
    )
  };
}

function buildRadar(input: {
  stageIndex: number;
  totalArtifacts: number;
  totalProjects: number;
  weekly: InsightCounters;
  monthly: InsightCounters;
}) {
  const ability = clampPercent(input.monthly.userMessages * 4 + input.totalArtifacts * 12 + input.stageIndex * 4);
  const resource = clampPercent(input.totalProjects * 18 + input.weekly.completedTasks * 10 + input.monthly.artifacts * 6);
  const cognition = clampPercent(input.monthly.feedbacks * 16 + input.monthly.userMessages * 3 + input.stageIndex * 5);
  const relationship = clampPercent(input.monthly.projectChats * 11 + input.weekly.completedTasks * 8 + input.stageIndex * 4);

  return [
    { label: "能力", value: ability },
    { label: "资源", value: resource },
    { label: "认知", value: cognition },
    { label: "关系", value: relationship }
  ];
}

function buildStrengths(input: {
  stageIndex: number;
  artifacts: InsightArtifact[];
  weekly: InsightCounters;
  monthly: InsightCounters;
  latestUserMessage: string;
}) {
  const tags: Array<{ label: string; score: number }> = [];
  const hasType = (type: string) => input.artifacts.some((item) => item.type === type);

  pushTag(tags, "结构化表达", hasType("structure") ? 5 : 0);
  pushTag(tags, "机会判断", hasType("score") ? 5 : 0);
  pushTag(tags, "报价设计", hasType("pricing") ? 5 : 0);
  pushTag(tags, "执行推进", input.weekly.completedTasks * 2 + input.weekly.projectChats);
  pushTag(tags, "复盘迭代", input.monthly.feedbacks * 3);
  pushTag(tags, "客户跟进", input.monthly.projectChats * 2);
  pushTag(tags, "问题拆解", input.monthly.userMessages);
  pushTag(tags, "阶段进阶", input.stageIndex * 2);

  if (/(ai|自动化|流程|sop)/i.test(input.latestUserMessage)) {
    pushTag(tags, "AI应用", 4);
  }

  const result = tags
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 4)
    .map((item) => item.label);

  return result;
}

function buildTraits(input: {
  weekly: InsightCounters;
  monthly: InsightCounters;
  totalArtifacts: number;
}) {
  const traits = [
    { label: input.monthly.userMessages >= 6 ? "主动探索" : "稳步积累", tone: "mint" },
    { label: input.weekly.completedTasks >= 2 ? "执行" : "耐心推进", tone: "gold" },
    { label: input.monthly.feedbacks >= 2 ? "复盘" : "感受敏锐", tone: "sky" },
    { label: input.totalArtifacts >= 2 ? "结构化" : "整理", tone: "blue" }
  ];

  return traits;
}

function hasRealProfileSignals(input: {
  weekly: InsightCounters;
  monthly: InsightCounters;
  totalProjects: number;
}) {
  return (
    input.weekly.completedTasks > 0 ||
    input.monthly.userMessages > 0 ||
    input.monthly.feedbacks > 0 ||
    input.monthly.projectChats > 0 ||
    input.monthly.artifacts > 0 ||
    input.totalProjects > 0
  );
}

function buildIkigai(input: {
  displayName: string;
  activeProject: InsightProject | null;
  strengths: string[];
  stageLabel: string;
  latestArtifact: InsightArtifact | null;
  weekly: InsightCounters;
  monthly: InsightCounters;
  totalProjects: number;
}) {
  if (!hasRealProfileSignals({
    weekly: input.weekly,
    monthly: input.monthly,
    totalProjects: input.totalProjects
  })) {
    return "";
  }

  const projectName = input.activeProject?.name || "当前主线";
  const keyStrength = input.strengths[0] || "结构化表达";
  const artifactTitle = input.latestArtifact?.title || "成果卡片";

  return `你正在把「${keyStrength}」沉淀成围绕「${projectName}」的可交付能力。目前最适合沿着 ${input.stageLabel || "成长主线"}，继续把「${artifactTitle}」打磨成别人愿意付费的结果。`;
}

function buildWeeklyComment(insights: UserInsights) {
  if (insights.weekly.completedTasks === 0 && insights.weekly.projectChats === 0) {
    return "这周的推进动作偏少，建议先把一件最小动作补上，树的状态会立刻恢复流动。";
  }

  if (insights.weekly.artifacts === 0) {
    return "这周有推进，但成果还没有沉淀成卡片。优先把一次对话或动作整理成结果物，会更容易放大。";
  }

  if (insights.weekly.feedbacks === 0) {
    return "执行节奏在，但反馈沉淀偏少。建议补一条结果复盘，把动作转成更明确的下一步。";
  }

  return `你这周的主线是「${insights.activeProject?.name || "当前项目"}」，动作、反馈和成果已经开始互相联动。`;
}

function buildMonthlyAdvice(insights: UserInsights) {
  if (insights.monthly.completedTasks < 3) {
    return "这个月的关键短板是执行密度不够。先固定一条每日推进动作，让树保持持续长叶。";
  }

  if (insights.monthly.artifacts < 2) {
    return "动作已经有了，但成果沉淀偏少。建议把最近一次有效推进整理成结果卡，帮助后续报价和复用。";
  }

  if (insights.monthly.projectChats < 3) {
    return "你的准备和思考都在增长，但项目推进轮次偏少。下一阶段优先把对话频率拉起来。";
  }

  return `你已经进入「${insights.stageLabel || "稳定推进"}」节奏，接下来最值得做的是围绕「${insights.activeProject?.name || "当前主线"}」持续放大。`;
}

function buildSocialNudge(insights: UserInsights) {
  if (insights.inactiveDays >= 5) {
    return "别等状态完美。现在只要补一个最小动作，你的树就会重新开始生长。";
  }

  if (insights.weekly.completedTasks === 0) {
    return "你不是缺能力，而是这周还没把动作落下去。先完成一件事，树就会继续往上长。";
  }

  return "你已经有节奏了，现在最重要的是别断。把今天这一轮推进补上，成长会更连续。";
}

function buildShareBars(insights: UserInsights, payload: Record<string, unknown>) {
  const scores = Array.isArray(payload.scores) ? payload.scores : [];
  if (scores.length) {
    return scores
      .map((item) => {
        if (!item || typeof item !== "object") {
          return null;
        }

        const record = item as Record<string, unknown>;
        return {
          label: String(record.label || "").trim(),
          value: clampPercent(record.percent || Number(record.value || 0) * 20)
        };
      })
      .filter((item): item is { label: string; value: number } => !!item && !!item.label)
      .slice(0, 5);
  }

  if (insights.latestArtifact?.scores.length) {
    return insights.latestArtifact.scores.map((score) => ({
      label: score.label,
      value: score.percent
    }));
  }

  return insights.radar.map((item) => ({
    label: item.label,
    value: item.value
  }));
}

function buildShareCaptionText(insights: UserInsights, title: string, quote: string) {
  const activeProject = insights.activeProject?.name || "当前主线";
  const shortQuote = truncateText(quote, 22);
  return `今天用一树OPC整理了「${title}」，把「${activeProject}」这条主线又往前推了一步。最有感觉的一句是：${shortQuote}`;
}

function buildShareQuote(insights: UserInsights) {
  if (insights.latestFeedbackSummary) {
    return truncateText(insights.latestFeedbackSummary, 20);
  }

  if (insights.latestTaskLabel) {
    return `把「${truncateText(insights.latestTaskLabel, 14)}」继续推进下去`;
  }

  return `继续围绕「${insights.activeProject?.name || insights.stageLabel || "成长主线"}」往前走`;
}

function buildHashtags(insights: UserInsights, payload: Record<string, unknown>) {
  const tags = new Set<string>();
  tags.add("#一人公司");
  tags.add("#一树OPC");

  const title = readString(payload.title || payload.resultTitle, 80).toLowerCase();
  if (title.includes("定价") || title.includes("报价")) {
    tags.add("#定价优化");
  } else if (title.includes("机会") || title.includes("资产")) {
    tags.add("#机会验证");
  } else {
    tags.add("#成长复盘");
  }

  const stage = insights.stageLabel;
  if (stage.includes("产品化")) {
    tags.add("#产品化");
  } else if (stage.includes("首单")) {
    tags.add("#首单冲刺");
  } else if (stage.includes("验证")) {
    tags.add("#机会验证");
  } else {
    tags.add("#AI搞钱");
  }

  return Array.from(tags).slice(0, 3);
}

function prettifyShareTitle(title: string) {
  const safeTitle = String(title || "").trim() || "我的成长卡片";
  if (safeTitle.includes("\n")) {
    return safeTitle;
  }

  if (safeTitle.length <= 8) {
    return `${safeTitle}\n值得继续做下去`;
  }

  return `${safeTitle}\n把下一步也拆清楚了`;
}

function buildStageLabel(stage: string, fallback: unknown) {
  if (!stage) {
    return String(fallback || "");
  }
  return stage;
}

function buildProfileGrowthSummary(insights: UserInsights) {
  return `最近 30 天你完成了 ${insights.monthly.completedTasks} 项任务、生成 ${insights.monthly.artifacts} 张成果卡，目前处在「${insights.stageLabel || "成长中"}」。`;
}

function buildInventorySummary(insights: UserInsights, strongAssets: string[], realCaseCount: number) {
  const lead = strongAssets[0] || insights.strengths[0] || "问题拆解";
  const casesText = realCaseCount > 0 ? `已沉淀 ${realCaseCount} 个真实案例线索` : "还缺更完整的真实案例";
  return `你当前处在「${insights.stageLabel || "资产探索期"}」，以「${lead}」为主线，${casesText}。下一步重点是继续补齐可调用资源、付费信号和第一单路径。`;
}

function buildDimensionSnapshot(input: {
  score: number;
  assets: string[];
  evidence: string[];
  defaultGap: string;
}) {
  return {
    score: input.score,
    status: resolveDimensionStatus(input.score, input.assets.length),
    assets: input.assets.slice(0, 6),
    evidence: input.evidence.slice(0, 3),
    monetization: resolveMonetizationLabel(input.score, input.assets.length),
    nextGap: input.assets.length ? [input.defaultGap] : [`先补充事实证据。${input.defaultGap}`]
  };
}

function resolveDimensionStatus(score: number, assetCount: number) {
  if (score >= 55 || assetCount >= 3) {
    return "已形成";
  }
  if (score >= 40 || assetCount >= 1) {
    return "已出现";
  }
  return "待确认";
}

function resolveMonetizationLabel(score: number, assetCount: number) {
  if (score >= 55 && assetCount >= 2) {
    return "强";
  }
  if (score >= 38 && assetCount >= 1) {
    return "中";
  }
  return "弱";
}

function buildRealCases(evidenceQuotes: string[]) {
  return evidenceQuotes.slice(0, 3).map((quote, index) => ({
    id: `case_${index + 1}`,
    title: inferCaseTitle(quote, index),
    summary: truncateText(quote, 88),
    evidence: quote,
    source: "message"
  }));
}

function inferCaseTitle(quote: string, index: number) {
  if (/ai|算法|模型|识别|图像/i.test(quote)) {
    return "AI / 模型案例";
  }
  if (/客户|商家|老板|转化|复购/.test(quote)) {
    return "客户增长案例";
  }
  if (/项目|带队|负责|落地|上线|现场/.test(quote)) {
    return "项目落地案例";
  }
  return `真实案例 ${index + 1}`;
}

function collectEvidenceQuotes(insights: UserInsights) {
  return compactUnique(
    insights.recentUserMessages
      .filter((item) => item.length >= 16)
      .map((item) => item.replace(/\s+/g, " ").trim())
  ).slice(-4);
}

function collectAbilityAssets(insights: UserInsights, quotes: string[]) {
  return compactUnique([
    ...extractAssetsByRules(quotes, [
      [/ai|算法|模型|识别|图像|自动化/i, "AI/算法落地"],
      [/优化|提升|准确率|转化|复购|效果|结果/, "优化迭代"],
      [/带队|负责|推进|管理|协调|项目/, "项目推进"],
      [/代码|开发|系统|工程|集成|上线/, "工程实现"],
      [/分析|拆解|复盘|诊断|判断/, "问题拆解"]
    ]),
    ...insights.strengths
  ]).slice(0, 6);
}

function collectResourceAssets(insights: UserInsights, quotes: string[]) {
  return compactUnique([
    ...extractAssetsByRules(quotes, [
      [/客户|商家|老板|需求方/, "潜在客户线索"],
      [/导师|学校|实验室|学院/, "组织背书"],
      [/畜牧局|政府|协会|园区/, "行业组织资源"],
      [/养殖场|供应商|渠道|合作方/, "产业链资源"],
      [/设备|摄像头|数据|样本/, "落地资源"]
    ]),
    insights.activeProject ? `围绕「${insights.activeProject.name}」的项目资源` : ""
  ]).slice(0, 6);
}

function collectCognitionAssets(insights: UserInsights, quotes: string[]) {
  return compactUnique([
    ...extractAssetsByRules(quotes, [
      [/我发现|本质|关键|核心|逻辑|判断/, "行业判断"],
      [/问题|痛点|卡点|瓶颈/, "问题定义"],
      [/路径|方案|策略|方法/, "解法设计"],
      [/拆解|诊断|分析/, "结构化认知"]
    ]),
    insights.strengths.includes("问题拆解") ? "结构化认知" : ""
  ]).slice(0, 6);
}

function collectRelationshipAssets(insights: UserInsights, quotes: string[]) {
  return compactUnique([
    ...extractAssetsByRules(quotes, [
      [/导师|老师|学校/, "导师信任"],
      [/客户|商家|老板|需求方/, "客户信任基础"],
      [/介绍|转介绍|推荐/, "转介绍可能性"],
      [/合作|对接|关系|熟悉/, "合作关系"],
      [/政府|畜牧局|供应商|养殖场/, "行业关系网络"]
    ]),
    insights.monthly.projectChats > 0 ? "持续对话网络" : ""
  ]).slice(0, 6);
}

function collectWorldNeeds(insights: UserInsights, quotes: string[]) {
  return compactUnique([
    ...extractAssetsByRules(quotes, [
      [/降本|增效|效率|巡检|识别|准确率|复购|转化/, "明确的业务结果需求"],
      [/痛点|问题|损失|难题/, "真实痛点存在"],
      [/养殖场|商家|客户|老板|需求方/, "目标用户明确"]
    ]),
    insights.activeProject ? `已有「${insights.activeProject.name}」场景需求` : ""
  ]).slice(0, 5);
}

function collectWillingToPay(insights: UserInsights, quotes: string[]) {
  return compactUnique([
    ...extractAssetsByRules(quotes, [
      [/付费|预算|报价|采购|成交|订单|收入/, "已有付费或预算信号"],
      [/客户|商家|需求方|项目/, "存在可转化对象"]
    ]),
    insights.latestArtifact?.tiers.length ? "已有可报价结构" : ""
  ]).slice(0, 5);
}

function collectLoveSignals(quotes: string[]) {
  return compactUnique(
    extractAssetsByRules(quotes, [
      [/喜欢|热爱|愿意长期做|有兴趣/, "愿意长期投入"],
      [/研究|深度研究|持续钻研/, "愿意深挖问题"],
      [/带队|推进|落地/, "愿意把事情做成"]
    ])
  ).slice(0, 4);
}

function extractAssetsByRules(quotes: string[], rules: Array<[RegExp, string]>) {
  const results: string[] = [];
  for (const quote of quotes) {
    for (const [pattern, label] of rules) {
      if (pattern.test(quote)) {
        results.push(label);
      }
    }
  }
  return compactUnique(results);
}

function buildPendingQuestion(assetCount: number, question: string) {
  return assetCount > 0 ? "" : question;
}

function toScoreMap(radar: Array<{ label: string; value: number }>) {
  return radar.reduce<Record<string, number>>((acc, item) => {
    acc[item.label] = clampPercent(item.value);
    return acc;
  }, {});
}

function compactUnique(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const safe = String(value || "").trim();
    if (!safe || seen.has(safe)) {
      continue;
    }
    seen.add(safe);
    result.push(safe);
  }
  return result;
}

function normalizeArtifact(source: {
  id: string;
  type: string;
  title: string;
  data: unknown;
  meta: string | null;
  summary: string | null;
  updatedAt: Date;
}): InsightArtifact {
  const data = source.data && typeof source.data === "object" && !Array.isArray(source.data)
    ? source.data as Record<string, unknown>
    : {};

  return {
    id: source.id,
    type: String(source.type || "").trim() || "structure",
    title: String(source.title || "未命名成果").trim(),
    meta: String(source.meta || "").trim(),
    summary: String(source.summary || "").trim(),
    updatedAt: source.updatedAt,
    scores: normalizeScores(data.scores),
    tiers: normalizeTiers(data.tiers),
    body: normalizeBody(data.body)
  };
}

function normalizeScores(source: unknown) {
  if (!Array.isArray(source)) {
    return [];
  }

  return source
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const record = item as Record<string, unknown>;
      return {
        label: String(record.label || "").trim(),
        percent: clampPercent(record.percent || Number(record.value || 0) * 20),
        value: typeof record.value === "number" ? record.value.toFixed(1) : String(record.value || ""),
        warn: !!record.warn
      };
    })
    .filter((item): item is { label: string; percent: number; value: string; warn: boolean } => !!item && !!item.label);
}

function normalizeTiers(source: unknown) {
  if (!Array.isArray(source)) {
    return [];
  }

  return source
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const record = item as Record<string, unknown>;
      return {
        label: String(record.label || "").trim(),
        price: String(record.price || "").trim(),
        active: !!record.active
      };
    })
    .filter((item): item is { label: string; price: string; active: boolean } => !!item && !!item.label);
}

function normalizeBody(source: unknown) {
  if (!Array.isArray(source)) {
    return [];
  }
  return source.map((item) => String(item || "").trim()).filter(Boolean);
}

function countWithin(dates: Date[], dateFrom: Date, dateTo: Date) {
  return dates.filter((date) => isWithin(date, dateFrom, dateTo)).length;
}

function countActiveDays(dates: Date[], dateFrom: Date, dateTo: Date) {
  const buckets = new Set(
    dates
      .filter((date) => isWithin(date, dateFrom, dateTo))
      .map((date) => date.toISOString().slice(0, 10))
  );

  return buckets.size;
}

function isWithin(date: Date, dateFrom: Date, dateTo: Date) {
  return date.getTime() >= startOfDay(dateFrom).getTime() && date.getTime() <= endOfDay(dateTo).getTime();
}

function resolveStageIndex(stageLabel: string) {
  if (!stageLabel) {
    return 0;
  }
  const index = STAGE_SEQUENCE.findIndex((item) => item === stageLabel);
  return index >= 0 ? index + 1 : 0;
}

function inferStageLabel(
  tasks: Array<{ done: boolean }>,
  feedbacks: Array<unknown>,
  projects: Array<{ artifacts: Array<unknown> }>
) {
  const doneTasks = tasks.filter((task) => task.done).length;
  const artifactCount = projects.reduce((sum, project) => sum + project.artifacts.length, 0);

  if (artifactCount >= 3 && feedbacks.length >= 2) {
    return "产品化期";
  }
  if (artifactCount >= 2 || doneTasks >= 2) {
    return "机会验证期";
  }
  if (projects.length > 0) {
    return "商业定位期";
  }
  if (doneTasks > 0 || feedbacks.length > 0) {
    return "资产探索期";
  }
  return "";
}

function resolveByline(stageIndex: number) {
  if (stageIndex <= 3) {
    return "来自 一树·挖宝";
  }
  if (stageIndex <= 5) {
    return "来自 一树·搞钱";
  }
  return "来自 一树·管家";
}

function pushTag(tags: Array<{ label: string; score: number }>, label: string, score: number) {
  if (score <= 0) {
    return;
  }

  const existing = tags.find((item) => item.label === label);
  if (existing) {
    existing.score += score;
    return;
  }

  tags.push({ label, score });
}

function clampPercent(value: unknown) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(numeric)));
}

function shiftDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function diffDays(from: Date, to: Date) {
  return Math.floor((startOfDay(to).getTime() - startOfDay(from).getTime()) / (24 * 60 * 60 * 1000));
}

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

function maxDate(candidates: Array<Date | null | undefined>) {
  const valid = candidates.filter((item): item is Date => item instanceof Date && !Number.isNaN(item.getTime()));
  if (!valid.length) {
    return null;
  }

  return valid.reduce((latest, current) => (current.getTime() > latest.getTime() ? current : latest));
}

function buildPeriodLabel(daysBack: number) {
  const end = new Date();
  const start = shiftDays(end, -daysBack);
  return `${start.getMonth() + 1}.${start.getDate()}-${end.getMonth() + 1}.${end.getDate()}`;
}

function formatDiff(value: number) {
  if (value > 0) {
    return `+${value}`;
  }
  return String(value);
}

function formatDiffWithUnit(value: number, unit: string) {
  if (!value) {
    return "";
  }
  return `${value > 0 ? "+" : ""}${value}${unit}`;
}

function truncateText(text: string, maxLength: number) {
  const safe = String(text || "").trim();
  if (safe.length <= maxLength) {
    return safe;
  }
  return `${safe.slice(0, maxLength)}…`;
}

function readString(value: unknown, maxLength: number) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim().slice(0, maxLength);
}

function formatMonthDay(date: Date) {
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}
