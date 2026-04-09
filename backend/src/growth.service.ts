import { Injectable, NotFoundException } from "@nestjs/common";
import { MessageRole, Prisma, SnapshotKind } from "@prisma/client";
import { PrismaService } from "./shared/prisma.service";
import {
  DEFAULT_PROFILE_DATA,
  DEFAULT_CURRENT_MILESTONE,
  DEFAULT_GROWTH_MILESTONES,
  DEFAULT_GROWTH_OVERVIEW
} from "./shared/templates";
import { readJsonArray, readJsonObject } from "./shared/json";
import { UserService } from "./user.service";
import { DEMO_USER_ID } from "./shared/catalog";

type GrowthMilestoneRecord = {
  id: string;
  title: string;
  stage: number;
  leaves: string;
  artifactTitle: string;
  phase: string;
  pendingMeta: string;
  unlockedCopy: string;
};

type GrowthSignals = {
  stageDates: Array<Date | null>;
  currentStageIndex: number;
  latestActivityAt: Date | null;
  totalMessages: number;
  completedTaskCount: number;
  feedbackCount: number;
  projectChatCount: number;
  latestUserMessage: string;
  latestFeedbackSummary: string;
  recentTaskLabels: string[];
  profileByline: string;
  strengths: string[];
  radar: Array<{ label: string; value: number }>;
  activeProject: {
    id: string;
    name: string;
    phase: string;
    status: string;
  } | null;
  projectArtifacts: Array<Record<string, unknown>>;
};

const GROWTH_MILESTONE_DEFINITIONS: GrowthMilestoneRecord[] = [
  {
    id: "m1",
    title: "完成资产盘点",
    stage: 1,
    leaves: "2片叶子",
    artifactTitle: "资产雷达图",
    phase: "资产探索期",
    pendingMeta: "继续回答你的经历、技能和优势",
    unlockedCopy: "你已经从模糊感受进入结构化盘点，第一层根系已经扎稳了。"
  },
  {
    id: "m2",
    title: "锁定商业方向",
    stage: 2,
    leaves: "1片叶子",
    artifactTitle: "定位语句",
    phase: "商业定位期",
    pendingMeta: "继续聊客户、痛点和最想做的方向",
    unlockedCopy: "方向开始收拢了，你不再只是“想创业”，而是正在形成可验证的商业路径。"
  },
  {
    id: "m3",
    title: "完成客户验证",
    stage: 3,
    leaves: "3片叶子",
    artifactTitle: "验证记录",
    phase: "机会验证期",
    pendingMeta: "完成一次任务、触达或客户验证会继续长叶",
    unlockedCopy: "你已经不只是思考，而是开始拿真实反馈校准方向。"
  },
  {
    id: "m4",
    title: "通过继续/停止决策",
    stage: 4,
    leaves: "1片叶子",
    artifactTitle: "决策单",
    phase: "决策推进期",
    pendingMeta: "补一次结果反馈，树会帮你做继续/切换判断",
    unlockedCopy: "你开始用反馈做决策，而不是只靠直觉推进。"
  },
  {
    id: "m5",
    title: "进入首单冲刺",
    stage: 5,
    leaves: "2片叶子",
    artifactTitle: "首单推进面板",
    phase: "首单冲刺期",
    pendingMeta: "继续推进项目对话和执行动作，冲刺第一单",
    unlockedCopy: "你已经进入首单冲刺区，树会把执行动作逼得更具体。"
  },
  {
    id: "m6",
    title: "完成产品化",
    stage: 6,
    leaves: "2片叶子",
    artifactTitle: "产品化方案",
    phase: "产品化期",
    pendingMeta: "继续聊流程、SOP、交付和产品化",
    unlockedCopy: "你开始从“靠个人硬扛”转向可复制的产品化结构。"
  },
  {
    id: "m7",
    title: "建立三层定价",
    stage: 7,
    leaves: "1片叶子",
    artifactTitle: "三层定价",
    phase: "定价优化期",
    pendingMeta: "继续聊报价、套餐和客单价，解锁三层定价",
    unlockedCopy: "定价结构出现以后，你的生意开始具备放大基础。"
  },
  {
    id: "m8",
    title: "月入稳定",
    stage: 8,
    leaves: "3片叶子",
    artifactTitle: "稳定增长面板",
    phase: "稳定增长期",
    pendingMeta: "继续聊复购、增长、渠道和稳定收入",
    unlockedCopy: "你的树已经进入稳定增长区，接下来是放大与复利。"
  }
];

const ASSET_SIGNAL_RE = /(不知道.*(做什么|卖什么|从哪开始)|资产|优势|经验|能力|资源|适合做什么|我会什么|我能做什么)/i;
const OPPORTUNITY_SIGNAL_RE = /(方向|定位|客户|痛点|卖给谁|机会|赛道|市场|需求|赚钱|值不值得做)/i;
const VALIDATION_SIGNAL_RE = /(客户验证|验证|触达|潜在客户|意向客户|跟进|反馈|成交|回复|试合作)/i;
const DECISION_SIGNAL_RE = /(go\/?no-?go|值不值得|要不要做|是否继续|活下去|继续推进|放弃|决策)/i;
const FIRST_ORDER_SIGNAL_RE = /(第一单|首单|成交|付费|签约|打款|收款)/i;
const PRODUCTIZATION_SIGNAL_RE = /(产品化|流程|系统|自动化|sop|交付|标准化)/i;
const PRICING_SIGNAL_RE = /(定价|报价|套餐|价格|客单价)/i;
const STABILITY_SIGNAL_RE = /(月入稳定|稳定增长|复购|增长|规模|扩张|团队|渠道)/i;

@Injectable()
export class GrowthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly userService: UserService
  ) {}

  async getGrowthTree(userId?: string | null) {
    const snapshot = await this.syncGrowthSnapshot(userId);

    return {
      overview: readJsonObject(snapshot.overview, DEFAULT_GROWTH_OVERVIEW),
      milestones: readJsonArray(snapshot.milestones, DEFAULT_GROWTH_MILESTONES as unknown as Record<string, unknown>[])
    };
  }

  async getCurrentGrowthMilestone(userId?: string | null) {
    const snapshot = await this.syncGrowthSnapshot(userId);
    return readJsonObject(snapshot.currentMilestone, DEFAULT_CURRENT_MILESTONE);
  }

  async getGrowthMilestoneById(userId: string, milestoneId: string) {
    const snapshot = await this.syncGrowthSnapshot(userId);
    const milestones = readJsonArray(snapshot.milestones, DEFAULT_GROWTH_MILESTONES as unknown as Record<string, unknown>[]);
    const target = milestones.find((item) => String(item.id || "") === milestoneId);

    if (!target) {
      throw new NotFoundException(`Milestone not found: ${milestoneId}`);
    }

    return target;
  }

  async touch(userId: string) {
    await this.syncGrowthSnapshot(userId);
  }

  private async syncGrowthSnapshot(userId?: string | null) {
    const user = await this.userService.getUserOrDemo(userId);
    let snapshot = await this.ensureGrowthSnapshot(user.id);

    if (user.id === DEMO_USER_ID) {
      return snapshot;
    }

    const previousMilestones = readJsonArray(
      snapshot.milestones,
      DEFAULT_GROWTH_MILESTONES as unknown as Record<string, unknown>[]
    );
    const signals = await this.buildGrowthSignals(user.id);
    const milestones = this.buildGrowthMilestones(signals, previousMilestones);
    const overview = this.buildGrowthOverview(signals, milestones);
    const currentMilestone = this.buildCurrentMilestone(signals, milestones);
    const nextStage = String(overview.phase || "").trim();

    snapshot = await this.prisma.growthSnapshot.update({
      where: {
        id: snapshot.id
      },
      data: {
        overview: overview as Prisma.InputJsonValue,
        milestones: milestones as Prisma.InputJsonValue,
        currentMilestone: currentMilestone as Prisma.InputJsonValue,
        updatedAt: new Date()
      }
    });

    await this.prisma.reportSnapshot.upsert({
      where: {
        userId_kind: {
          userId: user.id,
          kind: SnapshotKind.MILESTONE
        }
      },
      create: {
        userId: user.id,
        kind: SnapshotKind.MILESTONE,
        data: currentMilestone as Prisma.InputJsonValue
      },
      update: {
        data: currentMilestone as Prisma.InputJsonValue
      }
    });

    if (nextStage && nextStage !== String(user.stage || "").trim()) {
      await this.prisma.user.update({
        where: {
          id: user.id
        },
        data: {
          stage: nextStage
        }
      });
    }

    return snapshot;
  }

  private async ensureGrowthSnapshot(userId: string) {
    let snapshot = await this.prisma.growthSnapshot.findUnique({
      where: {
        userId
      }
    });

    if (!snapshot) {
      snapshot = await this.prisma.growthSnapshot.create({
        data: {
          userId,
          overview: DEFAULT_GROWTH_OVERVIEW,
          milestones: DEFAULT_GROWTH_MILESTONES,
          currentMilestone: DEFAULT_CURRENT_MILESTONE
        }
      });
    }

    return snapshot;
  }

  private async buildGrowthSignals(userId: string): Promise<GrowthSignals> {
    const [messages, completedTasks, feedbacks, projectChats, profileSnapshot, projects] = await Promise.all([
      this.prisma.message.findMany({
        where: {
          userId,
          role: MessageRole.USER
        },
        orderBy: {
          createdAt: "asc"
        },
        select: {
          text: true,
          createdAt: true
        }
      }),
      this.prisma.dailyTask.findMany({
        where: {
          userId,
          done: true
        },
        orderBy: {
          completedAt: "asc"
        },
        select: {
          label: true,
          completedAt: true,
          updatedAt: true
        }
      }),
      this.prisma.taskFeedback.findMany({
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
      }),
      this.prisma.conversation.findMany({
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
      }),
      this.prisma.reportSnapshot.findUnique({
        where: {
          userId_kind: {
            userId,
            kind: SnapshotKind.PROFILE
          }
        },
        select: {
          data: true
        }
      }),
      this.prisma.project.findMany({
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
      })
    ]);

    const normalizedMessages = messages.map((item) => ({
      rawText: String(item.text || "").trim(),
      text: normalizeSignalText(item.text),
      createdAt: item.createdAt
    }));
    const profile = readJsonObject(profileSnapshot?.data, DEFAULT_PROFILE_DATA);
    const normalizedProjects = projects.map((project) => ({
      id: project.id,
      name: project.name,
      phase: String(project.phase || "").trim(),
      status: String(project.status || "").trim(),
      artifacts: project.artifacts.map((artifact) => normalizeArtifactCard({
        id: artifact.id,
        type: artifact.type,
        title: artifact.title,
        data: artifact.data,
        meta: artifact.meta,
        summary: artifact.summary,
        cta: artifact.cta
      }))
    }));
    const projectArtifacts = normalizedProjects.flatMap((project) => project.artifacts);
    const totalMessages = normalizedMessages.length;
    const completedTaskCount = completedTasks.length;
    const feedbackCount = feedbacks.length;
    const projectChatCount = projectChats.length;

    const firstMessageAt = normalizedMessages[0]?.createdAt || null;
    const nthMessageAt = (index: number) => normalizedMessages[index - 1]?.createdAt || null;
    const firstKeywordAt = (matcher: RegExp) => {
      const hit = normalizedMessages.find((item) => matcher.test(item.text));
      return hit ? hit.createdAt : null;
    };
    const firstFeedbackKeywordAt = (matcher: RegExp) => {
      const hit = feedbacks.find((item) => matcher.test(normalizeSignalText(`${item.summary || ""} ${item.advice || ""}`)));
      return hit ? hit.createdAt : null;
    };
    const firstTaskAt = completedTasks[0] ? completedTasks[0].completedAt || completedTasks[0].updatedAt : null;
    const firstFeedbackAt = feedbacks[0]?.createdAt || null;
    const latestActivityAt = maxDate([
      normalizedMessages[normalizedMessages.length - 1]?.createdAt || null,
      completedTasks[completedTasks.length - 1]?.completedAt || completedTasks[completedTasks.length - 1]?.updatedAt || null,
      feedbacks[feedbacks.length - 1]?.createdAt || null,
      projectChats[projectChats.length - 1]?.updatedAt || null
    ]);

    const stage1At = firstKeywordAt(ASSET_SIGNAL_RE) || firstMessageAt;
    const stage2At = stage1At && (firstKeywordAt(OPPORTUNITY_SIGNAL_RE) || nthMessageAt(3));
    const stage3At = stage2At && (firstTaskAt || firstKeywordAt(VALIDATION_SIGNAL_RE) || nthMessageAt(5));
    const stage4At = stage3At && (firstFeedbackAt || firstKeywordAt(DECISION_SIGNAL_RE) || firstFeedbackKeywordAt(DECISION_SIGNAL_RE) || nthMessageAt(7));
    const stage5Fallback = completedTaskCount >= 2 && projectChatCount >= 2 && totalMessages >= 8 ? latestActivityAt : null;
    const stage5At = stage4At && (firstKeywordAt(FIRST_ORDER_SIGNAL_RE) || firstFeedbackKeywordAt(FIRST_ORDER_SIGNAL_RE) || stage5Fallback);
    const stage6Fallback = projectChatCount >= 3 && feedbackCount >= 2 ? latestActivityAt : null;
    const stage6At = stage5At && (firstKeywordAt(PRODUCTIZATION_SIGNAL_RE) || firstFeedbackKeywordAt(PRODUCTIZATION_SIGNAL_RE) || stage6Fallback);
    const stage7At = stage6At && (firstKeywordAt(PRICING_SIGNAL_RE) || firstFeedbackKeywordAt(PRICING_SIGNAL_RE));
    const stage8At = stage7At && (firstKeywordAt(STABILITY_SIGNAL_RE) || firstFeedbackKeywordAt(STABILITY_SIGNAL_RE));

    const stageDates = [stage1At, stage2At, stage3At, stage4At, stage5At, stage6At, stage7At, stage8At];
    const firstLockedIndex = stageDates.findIndex((item) => !item);

    return {
      stageDates,
      currentStageIndex: firstLockedIndex === -1 ? GROWTH_MILESTONE_DEFINITIONS.length - 1 : firstLockedIndex,
      latestActivityAt,
      totalMessages,
      completedTaskCount,
      feedbackCount,
      projectChatCount,
      latestUserMessage: normalizedMessages[normalizedMessages.length - 1]?.rawText || "",
      latestFeedbackSummary: String(feedbacks[feedbacks.length - 1]?.summary || "").trim(),
      recentTaskLabels: completedTasks
        .map((item) => String(item.label || "").trim())
        .filter(Boolean)
        .slice(-3),
      profileByline: String(profile.byline || "").trim(),
      strengths: Array.isArray(profile.strengths)
        ? profile.strengths.map((item) => String(item || "").trim()).filter(Boolean)
        : [],
      radar: normalizeRadar(profile.radar),
      activeProject: normalizedProjects[0]
        ? {
            id: normalizedProjects[0].id,
            name: normalizedProjects[0].name,
            phase: normalizedProjects[0].phase,
            status: normalizedProjects[0].status
          }
        : null,
      projectArtifacts
    };
  }

  private buildGrowthMilestones(signals: GrowthSignals, previousMilestones: Array<Record<string, unknown>>) {
    const previousById = previousMilestones.reduce<Record<string, Record<string, unknown>>>((acc, item) => {
      const id = String(item.id || "").trim();
      if (id) {
        acc[id] = item;
      }
      return acc;
    }, {});

    return GROWTH_MILESTONE_DEFINITIONS.map((definition, index) => {
      const previous = previousById[definition.id] || {};
      const stageAt = signals.stageDates[index];
      const done = !!stageAt;
      const isCurrent = !done && index === signals.currentStageIndex;
      const preservedDoneDate = done && normalizeMilestoneStatus(previous.status) === "done"
        ? normalizeStoredDateText(String(previous.date || previous.meta || "").trim())
        : "";
      const dateText = preservedDoneDate || (stageAt ? formatMonthDay(stageAt) : "");
      const meta = done
        ? buildDoneMeta(dateText, definition.leaves)
        : (isCurrent ? definition.pendingMeta : "待解锁");
      const summary = buildMilestoneSummary(definition, signals, {
        done,
        isCurrent
      });
      const resultCard = done || isCurrent
        ? buildMilestoneResultCard(definition, signals, {
            dateText,
            isCurrent
          })
        : undefined;

      return {
        id: definition.id,
        stage: definition.stage,
        title: definition.title,
        date: done ? dateText : (isCurrent ? "进行中" : "待解锁"),
        leaves: done ? definition.leaves : "",
        meta,
        status: done ? "done" : (isCurrent ? "current" : "todo"),
        artifactTitle: definition.artifactTitle,
        summary,
        ...(resultCard ? { resultCard } : {})
      };
    });
  }

  private buildGrowthOverview(signals: GrowthSignals, milestones: Array<Record<string, unknown>>) {
    const doneCount = milestones.filter((item) => normalizeMilestoneStatus(item.status) === "done").length;
    const currentStageNumber = Math.min(doneCount + 1, GROWTH_MILESTONE_DEFINITIONS.length);
    const currentDefinition = GROWTH_MILESTONE_DEFINITIONS[Math.min(signals.currentStageIndex, GROWTH_MILESTONE_DEFINITIONS.length - 1)];
    const allDone = doneCount >= GROWTH_MILESTONE_DEFINITIONS.length;
    const phase = allDone
      ? GROWTH_MILESTONE_DEFINITIONS[GROWTH_MILESTONE_DEFINITIONS.length - 1].phase
      : currentDefinition.phase;

    return {
      title: "我的一树",
      phase,
      progressLabel: allDone
        ? `你的一树已完成第${GROWTH_MILESTONE_DEFINITIONS.length}阶段 · ${phase}`
        : `你的一树已成长到第${currentStageNumber}阶段 · ${phase}`,
      hint: allDone
        ? "所有成长里程碑已点亮，接下来重点是持续放大成果"
        : `${currentDefinition.pendingMeta}，新的枝叶会随你的回答继续点亮。`,
      caption: allDone
        ? `最近一轮动作发生在${formatRelativeActivity(signals.latestActivityAt)}，继续维护复利节奏。`
        : `已完成 ${doneCount} / ${GROWTH_MILESTONE_DEFINITIONS.length} 个里程碑，当前聚焦「${currentDefinition.title}」。`,
      ctaText: "回到对话继续"
    };
  }

  private buildCurrentMilestone(signals: GrowthSignals, milestones: Array<Record<string, unknown>>) {
    const doneMilestones = milestones.filter((item) => normalizeMilestoneStatus(item.status) === "done");
    const latestUnlocked = doneMilestones[doneMilestones.length - 1];
    const currentDefinition = GROWTH_MILESTONE_DEFINITIONS[Math.min(signals.currentStageIndex, GROWTH_MILESTONE_DEFINITIONS.length - 1)];

    if (!latestUnlocked) {
      return {
        title: "成长提示",
        unlocked: "完成资产盘点",
        copy: "先把你的能力、经验和资源聊清楚，你的一树就会开始发芽。",
        primaryText: "看看我的树",
        secondaryText: "继续回答",
        followup: currentDefinition.pendingMeta
      };
    }

    return {
      title: "里程碑解锁",
      unlocked: String(latestUnlocked.title || currentDefinition.title),
      copy: currentDefinition.unlockedCopy,
      primaryText: "看看我的树",
      secondaryText: "分享成就",
      followup: currentDefinition.pendingMeta
    };
  }
}

function normalizeSignalText(value: unknown) {
  return String(value || "")
    .replace(/\s+/g, "")
    .trim()
    .toLowerCase();
}

function normalizeMilestoneStatus(status: unknown) {
  const normalized = String(status || "").trim().toLowerCase();
  if (normalized === "done") {
    return "done";
  }

  if (normalized === "doing" || normalized === "current" || normalized === "active") {
    return "current";
  }

  return "locked";
}

function formatMonthDay(date: Date) {
  const safeDate = date instanceof Date ? date : new Date(date);
  return `${safeDate.getMonth() + 1}月${safeDate.getDate()}日`;
}

function buildDoneMeta(dateText: string, leaves: string) {
  if (dateText && leaves) {
    return `${dateText} · ${leaves}`;
  }

  if (dateText) {
    return `${dateText} · 已解锁`;
  }

  return leaves || "已解锁";
}

function normalizeStoredDateText(source: string) {
  const text = String(source || "").trim();
  const directMatch = text.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (directMatch) {
    return `${Number(directMatch[1])}月${Number(directMatch[2])}日`;
  }

  const embeddedMatch = text.match(/(\d{1,2})\/(\d{1,2})/);
  if (embeddedMatch) {
    return `${Number(embeddedMatch[1])}月${Number(embeddedMatch[2])}日`;
  }

  return text;
}

function maxDate(candidates: Array<Date | null | undefined>) {
  const valid = candidates.filter((item): item is Date => item instanceof Date && !Number.isNaN(item.getTime()));
  if (!valid.length) {
    return null;
  }

  return valid.reduce((latest, current) => (current.getTime() > latest.getTime() ? current : latest));
}

function normalizeRadar(source: unknown) {
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
        value: clampPercent(record.value)
      };
    })
    .filter((item): item is { label: string; value: number } => !!item && !!item.label);
}

function normalizeArtifactCard(source: Record<string, unknown>) {
  const data = source.data && typeof source.data === "object" && !Array.isArray(source.data)
    ? source.data as Record<string, unknown>
    : {};
  const type = String(source.type || "").trim() || "structure";
  const normalized: Record<string, unknown> = {
    id: String(source.id || "").trim(),
    type,
    title: String(source.title || "未命名成果").trim(),
    meta: String(source.meta || "").trim(),
    summary: String(source.summary || "").trim()
  };

  if (type === "score") {
    normalized.scores = normalizeScores(data.scores);
    normalized.summary = String(normalized.summary || buildScoreSummary(normalized.scores as Array<Record<string, unknown>>));
  } else if (type === "pricing") {
    normalized.tiers = normalizeTiers(data.tiers);
  } else {
    normalized.type = "structure";
    normalized.body = normalizeBody(data.body);
  }

  if (source.cta && typeof source.cta === "object" && !Array.isArray(source.cta)) {
    normalized.cta = source.cta;
  }

  normalized.searchText = [
    normalized.title,
    normalized.meta,
    normalized.summary,
    ...(Array.isArray(normalized.body) ? normalized.body : []),
    ...(Array.isArray(normalized.scores)
      ? (normalized.scores as Array<Record<string, unknown>>).map((score) => `${score.label || ""} ${score.value || ""}`)
      : [])
  ]
    .join(" ")
    .toLowerCase();

  return normalized;
}

function buildMilestoneSummary(
  definition: GrowthMilestoneRecord,
  signals: GrowthSignals,
  state: { done: boolean; isCurrent: boolean }
) {
  const activeProjectName = signals.activeProject?.name || "当前主线";
  const latestTask = signals.recentTaskLabels[signals.recentTaskLabels.length - 1] || "本轮关键动作";

  switch (definition.stage) {
    case 1:
      if (state.done) {
        return `你已经把 ${buildListPreview(signals.strengths, "能力、经验和资源")} 盘成了可复用资产，树的第一层根系已经扎稳。`;
      }
      return "继续补充你的经历、技能和优势，资产雷达会随你的回答一起变清晰。";
    case 2:
      if (state.done) {
        return `方向开始收拢到「${activeProjectName}」这条主线，接下来重点是把客户、场景和价值说清楚。`;
      }
      return "方向正在收拢中，继续聊客户、痛点和付费场景会点亮这一层枝条。";
    case 3:
      if (state.done) {
        return `你已经完成 ${signals.completedTaskCount} 项动作、记录 ${signals.feedbackCount} 条反馈，验证证据开始成型。`;
      }
      return "再完成一次触达、跟进或反馈复盘，机会验证就会继续长叶。";
    case 4:
      if (state.done) {
        return "你已经开始用反馈做继续/停止判断，而不是只靠感觉继续推进。";
      }
      return "补一次结果反馈，树会基于证据帮你判断继续推进还是调整路径。";
    case 5:
      if (state.done) {
        return `当前主战项目是「${activeProjectName}」，首单冲刺已经启动，执行动作会被压得越来越具体。`;
      }
      return `继续围绕「${latestTask}」推进，树会把这一阶段收束到首单动作。`;
    case 6:
      if (state.done) {
        return `你已经开始把「${activeProjectName}」从个人输出转成可复制的交付结构。`;
      }
      return "继续聊流程、SOP、交付和产品化，树会开始长出更稳定的枝条。";
    case 7:
      if (state.done) {
        return "定价开始分层以后，你的成交和利润空间都会更容易被放大。";
      }
      return "继续聊报价、套餐和客单价，下一片叶子会落在定价结构上。";
    case 8:
      if (state.done) {
        return "你的树已经进入稳定增长区，接下来重点是复购、渠道和规模化。";
      }
      return "继续积累复购、增长和稳定动作，树会从“有结果”走向“可复利”。";
    default:
      return state.isCurrent ? definition.pendingMeta : "";
  }
}

function buildMilestoneResultCard(
  definition: GrowthMilestoneRecord,
  signals: GrowthSignals,
  state: { dateText: string; isCurrent: boolean }
) {
  const meta = buildCardMeta(state.dateText, resolveStageByline(definition.stage, signals.profileByline));
  const scoreArtifact = pickArtifact(signals.projectArtifacts, "score");
  const structureArtifact = pickArtifact(signals.projectArtifacts, "structure");
  const pricingArtifact = pickArtifact(signals.projectArtifacts, "pricing");

  switch (definition.stage) {
    case 1:
      return {
        title: "资产雷达",
        type: "score",
        scores: buildAssetScores(signals.radar),
        summary: buildAssetSummary(signals),
        meta
      };
    case 2:
      return structureArtifact || {
        title: "方向句式",
        type: "structure",
        body: [
          `当前主线：${signals.activeProject?.name || "正在收拢方向"}`,
          `当前阶段：${signals.activeProject?.phase || "继续盘客户与痛点"}`,
          `执行状态：${signals.activeProject?.status || `已完成 ${signals.completedTaskCount} 项动作`}`,
          `最近问题：${truncateLine(signals.latestUserMessage || "继续明确你的客户、场景与价值")}`
        ],
        meta
      };
    case 3:
      return scoreArtifact || {
        title: "机会评分",
        type: "score",
        scores: buildOpportunityScores(signals),
        summary: `验证信号 ${signals.completedTaskCount + signals.feedbackCount + signals.projectChatCount}/25 · ${signals.feedbackCount > 0 ? "GO" : "继续验证"}`,
        meta
      };
    case 4:
      return {
        title: "继续/停止决策单",
        type: "structure",
        body: [
          `判断依据：已完成 ${signals.completedTaskCount} 项任务`,
          `反馈沉淀：${signals.feedbackCount} 条`,
          `当前主线：${signals.activeProject?.name || "继续围绕当前机会推进"}`,
          `建议动作：${buildDecisionNextStep(signals)}`
        ],
        meta
      };
    case 5:
      return {
        title: "首单冲刺面板",
        type: "structure",
        body: [
          `主战项目：${signals.activeProject?.name || "当前验证项目"}`,
          `项目对话：${signals.projectChatCount} 轮`,
          `最近动作：${signals.recentTaskLabels[signals.recentTaskLabels.length - 1] || "继续推进触达与跟进"}`,
          `下一步：${buildSprintNextStep(signals)}`
        ],
        meta
      };
    case 6:
      return {
        title: "产品化方案",
        type: "structure",
        body: [
          `核心项目：${signals.activeProject?.name || "当前主线服务"}`,
          `沉淀成果：${signals.projectArtifacts.length} 张成果卡`,
          `优先固化：${buildProductizationFocus(signals)}`,
          `推进方式：${signals.feedbackCount > 1 ? "把已验证动作整理成 SOP" : "先补 1 次反馈复盘，再整理流程"}`
        ],
        meta
      };
    case 7:
      return pricingArtifact || {
        title: "三层定价",
        type: "pricing",
        tiers: buildPricingTiers(signals),
        meta
      };
    case 8:
      return {
        title: "稳定增长面板",
        type: "score",
        scores: buildStabilityScores(signals),
        summary: `活跃度 ${buildStabilityLabel(signals)} · 当前主线 ${signals.activeProject?.name || "持续成长中"}`,
        meta
      };
    default:
      return {
        title: definition.artifactTitle,
        type: "structure",
        body: [definition.pendingMeta],
        meta
      };
  }
}

function pickArtifact(artifacts: Array<Record<string, unknown>>, type: string) {
  const target = artifacts.find((item) => String(item.type || "").trim() === type);
  if (!target) {
    return null;
  }

  const { searchText: _searchText, ...rest } = target;
  return rest;
}

function buildAssetScores(radar: Array<{ label: string; value: number }>) {
  const safeRadar = radar.length
    ? radar
    : [
        { label: "能力", value: 58 },
        { label: "资源", value: 42 },
        { label: "认知", value: 61 },
        { label: "关系", value: 47 }
      ];

  return safeRadar.map((item) => ({
    label: item.label,
    percent: item.value,
    value: (item.value / 20).toFixed(1)
  }));
}

function buildAssetSummary(signals: GrowthSignals) {
  const total = buildAssetScores(signals.radar).reduce((sum, item) => sum + Number(item.value || 0), 0);
  return `总分 ${total.toFixed(1)}/20 · ${buildListPreview(signals.strengths, "已建立基础盘点")}`;
}

function buildOpportunityScores(signals: GrowthSignals) {
  const touch = clampPercent(40 + signals.totalMessages * 7 + signals.completedTaskCount * 8);
  const feedback = clampPercent(32 + signals.feedbackCount * 22 + signals.projectChatCount * 8);
  const execution = clampPercent(36 + signals.completedTaskCount * 18);
  const fit = clampPercent(45 + signals.totalMessages * 6 + signals.feedbackCount * 12);
  const pace = clampPercent(signals.latestActivityAt ? 84 : 48);

  return [
    { label: "触达", percent: touch, value: (touch / 20).toFixed(1) },
    { label: "反馈", percent: feedback, value: (feedback / 20).toFixed(1) },
    { label: "执行", percent: execution, value: (execution / 20).toFixed(1) },
    { label: "匹配", percent: fit, value: (fit / 20).toFixed(1) },
    { label: "节奏", percent: pace, value: (pace / 20).toFixed(1), warn: pace < 60 }
  ];
}

function buildStabilityScores(signals: GrowthSignals) {
  const execution = clampPercent(40 + signals.completedTaskCount * 16);
  const validation = clampPercent(35 + signals.feedbackCount * 18 + signals.projectChatCount * 10);
  const productization = clampPercent(30 + signals.projectArtifacts.length * 12);
  const pricing = clampPercent(28 + (signals.projectArtifacts.some((item) => item.type === "pricing") ? 48 : 12));
  const stability = clampPercent(signals.latestActivityAt ? 70 + Math.min(signals.totalMessages, 4) * 6 : 38);

  return [
    { label: "执行", percent: execution, value: (execution / 20).toFixed(1) },
    { label: "验证", percent: validation, value: (validation / 20).toFixed(1) },
    { label: "产品化", percent: productization, value: (productization / 20).toFixed(1) },
    { label: "定价", percent: pricing, value: (pricing / 20).toFixed(1) },
    { label: "稳定", percent: stability, value: (stability / 20).toFixed(1), warn: stability < 60 }
  ];
}

function buildPricingTiers(signals: GrowthSignals) {
  const tierShift = Math.max(signals.feedbackCount, signals.completedTaskCount);
  const starter = String(699 + tierShift * 100);
  const core = String(1999 + tierShift * 200);
  const premium = String(4999 + tierShift * 300);

  return [
    { label: "入门", price: starter, active: false },
    { label: "核心", price: core, active: true },
    { label: "高端", price: premium, active: false }
  ];
}

function buildDecisionNextStep(signals: GrowthSignals) {
  if (signals.feedbackCount > 0) {
    return "围绕最近一条反馈，把顾虑拆成风险对冲话术";
  }

  if (signals.completedTaskCount > 0) {
    return "补一轮结果反馈，再决定继续推进还是换切口";
  }

  return "先做一次最小触达或验证动作，拿到第一条真实反馈";
}

function buildSprintNextStep(signals: GrowthSignals) {
  if (signals.latestFeedbackSummary) {
    return `围绕「${truncateLine(signals.latestFeedbackSummary, 20)}」继续跟进`;
  }

  if (signals.recentTaskLabels.length) {
    return `把「${signals.recentTaskLabels[signals.recentTaskLabels.length - 1]}」推进到有明确回复`;
  }

  return "完成 1 次试合作邀约，并在 48 小时内完成跟进";
}

function buildProductizationFocus(signals: GrowthSignals) {
  if (signals.projectArtifacts.some((item) => item.type === "pricing")) {
    return "交付流程 + 复盘模板";
  }

  if (signals.projectArtifacts.some((item) => item.type === "structure")) {
    return "标准交付流程 + 报价结构";
  }

  return "交付流程 + 标准报价 + 复盘模板";
}

function buildStabilityLabel(signals: GrowthSignals) {
  if (!signals.latestActivityAt) {
    return "待激活";
  }

  if (signals.completedTaskCount >= 3 && signals.feedbackCount >= 2) {
    return "稳定上升";
  }

  if (signals.completedTaskCount >= 1) {
    return "持续积累";
  }

  return "刚起步";
}

function buildCardMeta(dateText: string, byline: string) {
  const safeDateText = String(dateText || "").trim() || "今日更新";
  const safeByline = String(byline || "").trim() || "一树OPC";
  return `生成于 ${safeDateText} · ${safeByline}`;
}

function resolveStageByline(stage: number, profileByline: string) {
  if (profileByline) {
    return profileByline;
  }

  if (stage <= 3) {
    return "一树·挖宝";
  }

  if (stage <= 5) {
    return "一树·搞钱";
  }

  if (stage <= 7) {
    return "一树·管家";
  }

  return "一树OPC";
}

function buildListPreview(items: string[], fallback: string) {
  const picked = items.filter(Boolean).slice(0, 3);
  if (!picked.length) {
    return fallback;
  }

  return picked.join("、");
}

function truncateLine(text: string, maxLength = 24) {
  const safeText = String(text || "").trim();
  if (!safeText) {
    return "继续推进当前关键问题";
  }

  return safeText.length > maxLength ? `${safeText.slice(0, maxLength)}…` : safeText;
}

function normalizeScores(source: unknown) {
  if (!Array.isArray(source)) {
    return [];
  }

  const normalized = source
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const record = item as Record<string, unknown>;
      const percent = clampPercent(record.percent ?? Number(record.value || 0) * 20);
      return {
        label: String(record.label || "").trim(),
        percent,
        value: typeof record.value === "number" ? record.value.toFixed(1) : String(record.value || (percent / 20).toFixed(1)),
        warn: !!record.warn
      };
    })
    .filter(Boolean);

  return normalized as Array<{
    label: string;
    percent: number;
    value: string;
    warn: boolean;
  }>;
}

function normalizeTiers(source: unknown) {
  if (!Array.isArray(source)) {
    return [];
  }

  const normalized = source
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
    .filter(Boolean);

  return normalized as Array<{
    label: string;
    price: string;
    active: boolean;
  }>;
}

function normalizeBody(source: unknown) {
  if (!Array.isArray(source)) {
    return [];
  }

  return source.map((item) => String(item || "").trim()).filter(Boolean);
}

function buildScoreSummary(scores: Array<Record<string, unknown>>) {
  if (!scores.length) {
    return "";
  }

  const total = scores.reduce((sum, item) => sum + Number(item.value || 0), 0);
  return `总分 ${total.toFixed(1)}/${scores.length * 5}`;
}

function clampPercent(value: unknown) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(numeric)));
}

function formatRelativeActivity(date: Date | null) {
  if (!date) {
    return "最近一次";
  }

  return formatMonthDay(date);
}
