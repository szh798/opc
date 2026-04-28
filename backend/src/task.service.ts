import { DailyTask, Prisma, Project } from "@prisma/client";
import { Injectable, NotFoundException } from "@nestjs/common";
import { OpportunityDifyService } from "./opportunity/opportunity-dify.service";
import { OpportunityService } from "./opportunity/opportunity.service";
import { OPPORTUNITY_CANONICAL_ARTIFACT_TYPES } from "./opportunity/opportunity.constants";
import { PrismaService } from "./shared/prisma.service";
import {
  buildTaskFeedbackAdvice,
  buildTaskFeedbackPrompt,
  getTaskFeedbackReplies
} from "./shared/catalog";
import { DEFAULT_DAILY_TASKS } from "./shared/templates";
import { UserService } from "./user.service";
import { GrowthService } from "./growth.service";

@Injectable()
export class TaskService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly userService: UserService,
    private readonly growthService: GrowthService,
    private readonly opportunityService: OpportunityService,
    private readonly opportunityDify: OpportunityDifyService
  ) {}

  async getDailyTasks(userId: string) {
    await this.userService.requireUser(userId);
    await this.syncDailyTasks(userId);
    await this.repairNextValidationActionFromOpenTasks(userId);

    const items = await this.prisma.dailyTask.findMany({
      where: {
        userId
      },
      orderBy: {
        createdAt: "asc"
      }
    });

    return {
      title: "一树帮你推动",
      items: items.map((item) => normalizeDailyTaskItem(item))
    };
  }

  async completeTask(userId: string, taskId: string, payload: Record<string, unknown>) {
    const target = await this.prisma.dailyTask.findFirst({
      where: {
        id: taskId,
        userId
      }
    });

    if (!target) {
      throw new NotFoundException(`Task not found: ${taskId}`);
    }

    await this.prisma.dailyTask.update({
      where: {
        id: target.id
      },
      data: {
        done: true,
        status: "completed",
        completedAt: new Date()
      }
    });
    const opportunitySummary = await this.advanceNextValidationActionAfterComplete(userId, target.projectId, target.id);
    await this.growthService.touch(userId).catch(() => undefined);

    return {
      success: true,
      taskId,
      done: true,
      opportunitySummary,
      payload
    };
  }

  async handleTaskAction(userId: string, taskId: string, payload: Record<string, unknown>) {
    const target = await this.prisma.dailyTask.findFirst({
      where: {
        id: taskId,
        userId
      }
    });

    if (!target) {
      throw new NotFoundException(`Task not found: ${taskId}`);
    }

    const action = normalizeTaskAction(payload.action);
    const value = String(payload.value || payload.feedback || payload.summary || payload.text || "").trim();
    const evidence = String(payload.evidence || "").trim();

    if (action === "complete") {
      await this.completeTask(userId, target.id, {
        label: target.label,
        text: value
      });
      const updated = await this.findDailyTask(userId, target.id);
      return {
        success: true,
        action,
        task: normalizeDailyTaskItem(updated || target)
      };
    }

    if (action === "blocked") {
      const feedback = await this.buildTaskFeedback(userId, {
        taskId: target.id,
        taskLabel: target.label,
        summary: value || "blocked",
        evidence,
        outcome: "blocked",
        metadata: payload.metadata || {}
      });
      const updated = await this.findDailyTask(userId, target.id);
      return {
        success: true,
        action,
        task: normalizeDailyTaskItem(updated || target),
        feedback,
        routerAction: {
          routeAction: "task_blocked",
          userText: `我卡在「${target.label}」了`,
          metadata: {
            taskId: target.id,
            taskLabel: target.label
          }
        }
      };
    }

    if (action === "feedback") {
      const feedback = await this.buildTaskFeedback(userId, {
        taskId: target.id,
        taskLabel: target.label,
        summary: value,
        evidence,
        outcome: normalizeTaskOutcome(payload.outcome || "got_signal"),
        metadata: payload.metadata || {}
      });
      const updated = await this.findDailyTask(userId, target.id);
      return {
        success: true,
        action,
        task: normalizeDailyTaskItem(updated || target),
        feedback
      };
    }

    if (action === "replace") {
      const updated = await this.replaceDailyTask(userId, target, {
        feedback: value,
        evidence
      });
      await this.growthService.touch(userId).catch(() => undefined);
      return {
        success: true,
        action,
        replaced: true,
        task: normalizeDailyTaskItem(updated || target)
      };
    }

    if (action === "skipped") {
      await this.prisma.dailyTask.update({
        where: {
          id: target.id
        },
        data: {
          status: "skipped",
          done: false,
          feedback: value || null,
          evidence: evidence ? { text: evidence } : Prisma.JsonNull
        }
      });
      const updated = await this.findDailyTask(userId, target.id);
      return {
        success: true,
        action,
        task: normalizeDailyTaskItem(updated || target)
      };
    }

    return {
      success: true,
      action,
      task: normalizeDailyTaskItem(target)
    };
  }

  async buildTaskFeedback(userId: string, payload: Record<string, unknown>) {
    const taskLabel = String(payload.taskLabel || payload.label || "这项任务");
    const summary = String(payload.summary || payload.userText || payload.text || "");
    const outcome = normalizeTaskOutcome(payload.outcome);
    const evidence = String(payload.evidence || "").trim();
    const taskId = readString(payload.taskId, 128);
    const advice = buildTaskFeedbackAdvice(summary, taskLabel);

    await this.prisma.taskFeedback.create({
      data: {
        userId,
        taskId,
        taskLabel,
        summary,
        advice,
        payload: {
          ...payload,
          outcome,
          evidence
        } as Prisma.InputJsonValue
      }
    });
    if (taskId) {
      await this.prisma.dailyTask.updateMany({
        where: {
          id: taskId,
          userId
        },
        data: {
          status: mapOutcomeToTaskStatus(outcome),
          done: outcome === "done" || outcome === "got_signal",
          completedAt: outcome === "done" || outcome === "got_signal" ? new Date() : null,
          feedback: summary || null,
          evidence: evidence ? { text: evidence } : Prisma.JsonNull
        }
      });
    }
    let opportunitySummary = await this.opportunityService.applyTaskFeedbackUpdate({
      userId,
      taskId,
      summary: [summary, evidence ? `证据：${evidence}` : ""].filter(Boolean).join("\n")
    });
    if (!opportunitySummary) {
      opportunitySummary = await this.opportunityService.applyFocusProjectFeedbackUpdate({
        userId,
        summary
      });
    }
    await this.growthService.touch(userId).catch(() => undefined);

    const nextMessages = [
      {
        id: `feedback-status-${Date.now()}`,
        type: "status_chip",
        label: taskLabel,
        status: "done"
      },
      {
        id: `feedback-prompt-${Date.now()}`,
        type: "agent",
        text: buildTaskFeedbackPrompt(taskLabel)
      },
      {
        id: `feedback-advice-${Date.now()}`,
        type: "agent",
        text: advice
      }
    ];
    if (opportunitySummary && opportunitySummary.nextValidationAction) {
      nextMessages.push({
        id: `feedback-next-action-${Date.now()}`,
        type: "agent",
        text: `我已经把这次反馈记到当前机会里了。下一步先做：${opportunitySummary.nextValidationAction}`
      });
    }

    return {
      messages: nextMessages,
      quickReplies: getTaskFeedbackReplies(),
      opportunitySummary
    };
  }

  private async advanceNextValidationActionAfterComplete(userId: string, projectId: string | null, completedTaskId: string) {
    const normalizedProjectId = String(projectId || "").trim();
    if (!normalizedProjectId) {
      return null;
    }

    const nextTask = await this.prisma.dailyTask.findFirst({
      where: {
        userId,
        projectId: normalizedProjectId,
        id: {
          not: completedTaskId
        },
        done: false
      },
      orderBy: {
        createdAt: "asc"
      }
    });
    const nextAction = nextTask
      ? String(nextTask.label || "").trim()
      : "补充这轮任务结果，我来更新机会评分";

    await this.prisma.project.update({
      where: {
        id: normalizedProjectId
      },
      data: {
        nextValidationAction: nextAction || null,
        nextValidationActionAt: new Date()
      }
    });

    return this.opportunityService.getProjectOpportunitySummary(userId, normalizedProjectId);
  }

  private async repairNextValidationActionFromOpenTasks(userId: string) {
    const focusProject = await this.opportunityService.getFocusProject(userId);
    if (!focusProject) {
      return;
    }

    const tasks = await this.prisma.dailyTask.findMany({
      where: {
        userId,
        projectId: focusProject.id
      },
      orderBy: {
        createdAt: "asc"
      }
    });
    const firstOpenTask = tasks.find((item) => !item.done);
    if (!firstOpenTask) {
      return;
    }

    const completedLabels = new Set(
      tasks
        .filter((item) => item.done)
        .map((item) => String(item.label || "").trim())
        .filter(Boolean)
    );
    const currentNextAction = String(focusProject.nextValidationAction || "").trim();
    if (!currentNextAction || !completedLabels.has(currentNextAction)) {
      return;
    }

    await this.prisma.project.update({
      where: {
        id: focusProject.id
      },
      data: {
        nextValidationAction: String(firstOpenTask.label || "").trim() || null,
        nextValidationActionAt: new Date()
      }
    });
  }

  private findDailyTask(userId: string, taskId: string) {
    return this.prisma.dailyTask.findFirst({
      where: {
        id: taskId,
        userId
      }
    });
  }

  private async replaceDailyTask(
    userId: string,
    target: DailyTask,
    input: { feedback?: string; evidence?: string } = {}
  ) {
    const siblingTasks = await this.prisma.dailyTask.findMany({
      where: {
        userId,
        projectId: target.projectId || undefined,
        cycleNo: target.cycleNo || undefined
      },
      orderBy: {
        createdAt: "asc"
      }
    });
    const project = target.projectId
      ? await this.prisma.project.findFirst({
          where: {
            id: target.projectId,
            userId
          }
        })
      : null;
    const existingLabels = siblingTasks.map((item) => item.label);
    const replacement =
      await this.planReplacementTaskWithDify({
        userId,
        target,
        project,
        siblingTasks
      }) || buildReplacementTask(target, existingLabels);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.dailyTask.update({
        where: {
          id: target.id
        },
        data: {
          label: replacement.label,
          taskType: replacement.taskType,
          status: "pending",
          done: false,
          completedAt: null,
          feedback: input.feedback || null,
          evidence: input.evidence ? { text: input.evidence } : Prisma.JsonNull
        }
      });

      if (target.projectId && target.cycleNo) {
        const nextCycle = replaceTaskInFollowupCycle(project?.currentFollowupCycle, target, replacement);

        if (project && nextCycle) {
          const projectData: Prisma.ProjectUpdateInput = {
            currentFollowupCycle: nextCycle as Prisma.InputJsonValue
          };
          if (String(project.nextValidationAction || "").trim() === String(target.label || "").trim()) {
            projectData.nextValidationAction = replacement.label;
            projectData.nextValidationActionAt = new Date();
          }

          await tx.project.update({
            where: {
              id: project.id
            },
            data: projectData
          });
          await tx.projectArtifact.updateMany({
            where: {
              projectId: project.id,
              type: OPPORTUNITY_CANONICAL_ARTIFACT_TYPES.followupCycle,
              versionScope: `cycle-${target.cycleNo}`,
              deletedAt: null
            },
            data: {
              data: {
                artifactVersion: target.cycleNo,
                cycle: nextCycle
              } as Prisma.InputJsonValue,
              summary: String((nextCycle as Record<string, unknown>).goal || "")
            }
          });
        }
      }

      return updated;
    });
  }

  private async planReplacementTaskWithDify(input: {
    userId: string;
    target: DailyTask;
    project: Project | null;
    siblingTasks: DailyTask[];
  }): Promise<ReplacementTask | null> {
    if (!input.project) {
      return null;
    }

    try {
      const initiationSummary = await this.readCurrentInitiationSummary(input.project.id);
      const recentFeedback = await this.prisma.taskFeedback.findMany({
        where: {
          userId: input.userId
        },
        orderBy: {
          createdAt: "desc"
        },
        take: 10
      });
      const currentCycle = buildReplacementPlannerCycleInput({
        currentCycle: input.project.currentFollowupCycle,
        target: input.target,
        siblingTasks: input.siblingTasks
      });
      const plannedCycle = await this.opportunityDify.planFollowupCycle({
        userId: input.userId,
        project: input.project,
        cycleNo: Number(input.target.cycleNo || 1),
        initiationSummary,
        currentCycle,
        recentFeedback: [
          {
            taskId: input.target.id,
            taskLabel: input.target.label,
            summary: "用户点击了换一个：需要为这条任务生成一个新的同周期替代任务，不要重复已有任务。",
            advice: "替代任务必须更轻、更具体，适合作为今天的一件小事。",
            createdAt: new Date().toISOString()
          },
          ...recentFeedback.map((item) => ({
            taskId: item.taskId || "",
            taskLabel: item.taskLabel || "",
            summary: item.summary || "",
            advice: item.advice || "",
            createdAt: item.createdAt.toISOString()
          }))
        ]
      });

      return pickDifyReplacementTask(plannedCycle?.tasks || [], input.target, input.siblingTasks.map((item) => item.label));
    } catch (_error) {
      return null;
    }
  }

  private async readCurrentInitiationSummary(projectId: string) {
    const artifact = await this.prisma.projectArtifact.findFirst({
      where: {
        projectId,
        type: OPPORTUNITY_CANONICAL_ARTIFACT_TYPES.initiation,
        versionScope: "current",
        deletedAt: null
      },
      orderBy: {
        updatedAt: "desc"
      }
    });
    const data = parseRecord(artifact?.data);
    return parseRecord(data?.summary) || data || {};
  }

  private async syncDailyTasks(userId: string) {
    const desiredTasks = await this.buildDesiredTasks(userId);
    const expectedIds = desiredTasks.map((item) => item.id);
    const existing = await this.prisma.dailyTask.findMany({
      where: { userId }
    });
    const existingById = new Map(existing.map((item) => [item.id, item]));

    const staleIds = existing
      .map((item) => item.id)
      .filter((id) => !expectedIds.includes(id));
    if (staleIds.length) {
      await this.prisma.dailyTask.deleteMany({
        where: {
          id: { in: staleIds },
          userId,
          projectId: null
        }
      });
      await this.prisma.dailyTask.updateMany({
        where: {
          id: { in: staleIds },
          userId,
          projectId: { not: null },
          status: "pending"
        },
        data: {
          status: "closed"
        }
      });
    }

    for (const desired of desiredTasks) {
      const current = existingById.get(desired.id);
      const matchesCurrentTask =
        current &&
        current.label === desired.label &&
        String(current.tag || "") === String(desired.tag || "") &&
        String(current.projectId || "") === String(desired.projectId || "") &&
        Number(current.cycleNo || 0) === Number((desired as any).cycleNo || 0);

      if (!current) {
        await this.prisma.dailyTask.create({
          data: desired
        });
        continue;
      }

      await this.prisma.dailyTask.update({
        where: { id: current.id },
        data: {
          label: desired.label,
          tag: desired.tag,
          projectId: desired.projectId || null,
          cycleNo: (desired as any).cycleNo || null,
          taskType: (desired as any).taskType || null,
          done: matchesCurrentTask && current.done && !!current.completedAt,
          status: matchesCurrentTask && current.done && !!current.completedAt ? current.status : "pending",
          completedAt: matchesCurrentTask && current.done && !!current.completedAt ? current.completedAt : null
        }
      });
    }
  }

  private async buildDesiredTasks(userId: string) {
    const focusProject = await this.opportunityService.getFocusProject(userId);
    if (!focusProject) {
      return DEFAULT_DAILY_TASKS.map((task, index) => ({
        id: buildDailyTaskId(userId, index + 1),
        userId,
        label: task.label,
        tag: task.tag,
        projectId: null as string | null
      }));
    }

    const stage = String(focusProject.opportunityStage || "").trim();
    const decisionStatus = String(focusProject.decisionStatus || "").trim();
    const projectTag = String(focusProject.name || "当前机会").trim() || "当前机会";
    const currentCycle = readCurrentFollowupCycle(focusProject.currentFollowupCycle);
    if (currentCycle) {
      return currentCycle.tasks.slice(0, 3).map((task, index) => ({
        id: `${focusProject.id}-cycle-${currentCycle.cycleNo}-task-${index + 1}`,
        userId,
        label: String(task.label || "").trim().slice(0, 120),
        tag: projectTag,
        projectId: focusProject.id,
        cycleNo: currentCycle.cycleNo,
        taskType: String(task.taskType || "validation").trim() || "validation"
      }));
    }
    const nextValidationAction = String(focusProject.nextValidationAction || "").trim();
    const lastValidationSignal = String(focusProject.lastValidationSignal || "").trim();
    const labels = buildOpportunityTasksByStage({
      stage,
      decisionStatus,
      nextValidationAction,
      lastValidationSignal
    });

    return labels.map((label, index) => ({
      id: buildDailyTaskId(userId, index + 1),
      userId,
      label,
      tag: projectTag,
      projectId: focusProject.id
    }));
  }
}

function readString(value: unknown, maxLength: number) {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  return trimmed.slice(0, maxLength);
}

function buildDailyTaskId(userId: string, slot: number) {
  return `${userId}-daily-task-${slot}`;
}

function buildReplacementPlannerCycleInput(input: {
  currentCycle: unknown;
  target: DailyTask;
  siblingTasks: DailyTask[];
}) {
  const cycle = parseRecord(input.currentCycle) || {};
  return {
    ...cycle,
    replacementRequest: {
      oldTask: {
        id: input.target.id,
        label: input.target.label,
        taskType: inferTaskType(input.target.taskType, input.target.label),
        cycleNo: input.target.cycleNo || null
      },
      existingTasks: input.siblingTasks.map((item) => ({
        id: item.id,
        label: item.label,
        taskType: inferTaskType(item.taskType, item.label),
        status: item.status,
        done: item.done
      })),
      instruction: "Generate one concrete replacement task for oldTask. Keep it small, actionable, and different from existingTasks."
    }
  };
}

function parseRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

type ReplacementTask = {
  label: string;
  taskType: string;
};

function pickDifyReplacementTask(
  tasks: Array<{ label?: string; taskType?: string }>,
  target: DailyTask,
  existingLabels: string[] = []
): ReplacementTask | null {
  const targetType = inferTaskType(target.taskType, target.label);
  const existing = new Set(
    existingLabels
      .concat(target.label)
      .map((item) => String(item || "").trim())
      .filter(Boolean)
  );
  const normalizedTasks = tasks
    .map((task) => ({
      label: String(task.label || "").trim(),
      taskType: inferTaskType(task.taskType, task.label)
    }))
    .filter((task) => task.label && !existing.has(task.label));
  const preferred = normalizedTasks.find((task) => task.taskType.includes(targetType) || targetType.includes(task.taskType));
  const selected = preferred || normalizedTasks[0];

  return selected
    ? {
        label: selected.label.slice(0, 120),
        taskType: selected.taskType
      }
    : null;
}

function buildReplacementTask(target: DailyTask, existingLabels: string[] = []): ReplacementTask {
  const originalType = inferTaskType(target.taskType, target.label);
  const existing = new Set(
    existingLabels
      .concat(target.label)
      .map((item) => String(item || "").trim())
      .filter(Boolean)
  );
  const candidates = buildReplacementTaskCandidates(originalType);
  const label = candidates.find((item) => !existing.has(item)) || buildFallbackReplacementLabel(originalType, existing.size);

  return {
    label: label.slice(0, 120),
    taskType: originalType
  };
}

function inferTaskType(taskType?: string | null, label?: string | null) {
  const normalized = String(taskType || "").trim().toLowerCase();
  if (normalized) {
    return normalized;
  }

  const text = String(label || "");
  if (/输出|方案|清单|总结|复盘|分析|整理成/.test(text)) {
    return "output";
  }
  if (/收集|整理|记录|标记|数据|原话|反馈|证据/.test(text)) {
    return "evidence";
  }
  return "validation";
}

function buildReplacementTaskCandidates(taskType: string) {
  if (taskType.includes("evidence")) {
    return [
      "整理 3 条客户原话，标出强需求和弱需求",
      "记录 1 条客户愿意付费的证据",
      "收集 1 个同类服务的报价或案例",
      "把今天拿到的反馈写成 3 行判断",
      "找 1 个类似客户案例，记录他的真实痛点"
    ];
  }

  if (taskType.includes("output") || taskType.includes("analysis") || taskType.includes("plan")) {
    return [
      "写出 1 页最小验证方案",
      "输出 3 个关键问题和下一步动作",
      "把服务流程拆成 3 个交付步骤",
      "写 1 版客户沟通开场白",
      "整理 1 个可执行的 24 小时验证动作"
    ];
  }

  return [
    "找 1 个潜在客户，问他最想解决的一个具体问题",
    "给 1 个潜在客户发出二选一问题",
    "约 1 个熟人做 15 分钟需求确认",
    "把一个客户问题改写成一句可验证假设",
    "找 1 个目标客户确认是否愿意为这个结果付费"
  ];
}

function buildFallbackReplacementLabel(taskType: string, seed: number) {
  if (taskType.includes("evidence")) {
    return `补 1 条新的验证证据，并写下判断 ${seed + 1}`;
  }
  if (taskType.includes("output") || taskType.includes("analysis") || taskType.includes("plan")) {
    return `写 1 个新的最小验证动作 ${seed + 1}`;
  }
  return `联系 1 个新的验证对象，问清一个真实需求 ${seed + 1}`;
}

function replaceTaskInFollowupCycle(
  value: unknown,
  target: DailyTask,
  replacement: ReplacementTask
): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const source = value as Record<string, unknown>;
  if (Number(source.cycleNo || 0) !== Number(target.cycleNo || 0)) {
    return null;
  }

  const tasks = Array.isArray(source.tasks) ? source.tasks : [];
  if (!tasks.length) {
    return null;
  }

  const indexFromId = readTaskIndexFromId(target.id);
  const targetIndex = tasks.findIndex((task, index) => {
    if (!task || typeof task !== "object" || Array.isArray(task)) {
      return false;
    }
    const item = task as Record<string, unknown>;
    return (
      String(item.id || "").trim() === String(target.id || "").trim() ||
      String(item.label || "").trim() === String(target.label || "").trim() ||
      (indexFromId > 0 && index === indexFromId - 1)
    );
  });

  if (targetIndex < 0) {
    return null;
  }

  const nextTasks = tasks.map((task, index) => {
    if (index !== targetIndex || !task || typeof task !== "object" || Array.isArray(task)) {
      return task;
    }

    return {
      ...(task as Record<string, unknown>),
      label: replacement.label,
      taskType: replacement.taskType
    };
  });

  return {
    ...source,
    tasks: nextTasks
  };
}

function readTaskIndexFromId(taskId: string) {
  const match = String(taskId || "").match(/-task-(\d+)$/);
  return match ? Number(match[1]) : 0;
}

function normalizeTaskOutcome(value: unknown) {
  const normalized = String(value || "").trim();
  if (["done", "skipped", "blocked", "got_signal"].includes(normalized)) {
    return normalized;
  }
  return "done";
}

function normalizeTaskAction(value: unknown) {
  const normalized = String(value || "").trim();
  if (["start", "complete", "pause", "blocked", "replace", "feedback", "skipped", "review", "continue"].includes(normalized)) {
    return normalized;
  }
  return "feedback";
}

function normalizeDailyTaskItem(
  item: {
    id: string;
    label: string;
    content?: string | null;
    tag?: string | null;
    agentKey?: string | null;
    status?: string | null;
    done?: boolean | null;
    completedAt?: Date | string | null;
    feedback?: string | null;
    projectId?: string | null;
    cycleNo?: number | null;
    taskType?: string | null;
  },
  virtualStatus?: string
) {
  const isActuallyCompleted = !!item.done && !!item.completedAt;
  const status = virtualStatus || (isActuallyCompleted ? "completed" : String(item.status || "pending"));
  const normalizedStatus = status === "completed" && !isActuallyCompleted ? "pending" : status;
  const label = String(item.label || "").trim();
  return {
    id: item.id,
    title: label,
    label,
    reason: String(item.content || item.taskType || "验证这个方向有没有真实需求").trim(),
    project_name: String(item.tag || "").trim(),
    tag: String(item.tag || "").trim(),
    agent_role: String(item.agentKey || "gaoqian").trim(),
    estimate_minutes: resolveTaskEstimateMinutes(item),
    status: normalizedStatus,
    statusLabel: mapDailyTaskStatusLabel(normalizedStatus),
    done: normalizedStatus === "completed",
    completedAt: item.completedAt ? new Date(item.completedAt).toISOString() : "",
    result_summary: item.feedback || null,
    projectId: item.projectId || "",
    cycleNo: item.cycleNo || null,
    taskType: item.taskType || "",
    actions: buildDailyTaskActions(normalizedStatus, item.taskType || "", label)
  };
}

function resolveTaskEstimateMinutes(item: { label?: string | null; content?: string | null; taskType?: string | null }) {
  const type = String(item.taskType || "").trim().toLowerCase();
  const text = `${item.label || ""} ${item.content || ""}`.trim();
  const explicitMinutes = extractExplicitMinutes(text);
  if (explicitMinutes) {
    return explicitMinutes;
  }

  if (/输出|方案|清单|总结|整理成|写|生成|复盘|分析/.test(text)) {
    return 25;
  }

  if (type.includes("evidence") || /收集|整理|记录|标记|数据|原话|反馈|证据/.test(text)) {
    return 10;
  }

  if (type.includes("validation") || /验证|客户|潜在|触达|询问|沟通|访谈|约/.test(text)) {
    return 15;
  }

  return 15;
}

function extractExplicitMinutes(text: string) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  const match = normalized.match(/(\d{1,3})\s*(分钟|min|mins|minute|minutes)/i);
  if (!match) {
    return 0;
  }

  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }

  return Math.min(Math.max(Math.round(value), 5), 180);
}

function mapDailyTaskStatusLabel(status: string) {
  switch (status) {
    case "completed":
      return "已完成";
    case "blocked":
      return "卡住了";
    case "skipped":
      return "已跳过";
    case "closed":
      return "已归档";
    case "pending":
    default:
      return "待开始";
  }
}

function buildDailyTaskActions(status: string, taskType = "", label = "") {
  const type = String(taskType || "").toLowerCase();
  const taskLabel = String(label || "");
  switch (status) {
    case "completed":
      if (type.includes("evidence") || /原话|反馈|证据|记录/.test(taskLabel)) {
        return [
          { key: "feedback", label: "聊聊自己反馈", primary: true },
          { key: "review", label: "判断信号" }
        ];
      }
      if (type.includes("validation") || /客户|潜在|触达|问他们/.test(taskLabel)) {
        return [
          { key: "feedback", label: "聊聊自己反馈", primary: true },
          { key: "review", label: "聊聊客户反馈" }
        ];
      }
      return [
        { key: "feedback", label: "聊聊自己反馈", primary: true },
        { key: "review", label: "复盘这条" }
      ];
    case "blocked":
      return [
        { key: "continue", label: "继续聊" },
        { key: "replace", label: "换一个" }
      ];
    case "skipped":
      return [
        { key: "replace", label: "换一个" }
      ];
    case "pending":
    default:
      return [
        { key: "complete", label: "完成", primary: true },
        { key: "blocked", label: "我卡住了" },
        { key: "replace", label: "换一个" }
      ];
  }
}

function mapOutcomeToTaskStatus(outcome: string) {
  switch (outcome) {
    case "skipped":
      return "skipped" as const;
    case "blocked":
      return "blocked" as const;
    case "done":
    case "got_signal":
    default:
      return "completed" as const;
  }
}

function readCurrentFollowupCycle(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const source = value as Record<string, unknown>;
  const cycleNo = Number(source.cycleNo || 0);
  const tasks = Array.isArray(source.tasks)
    ? source.tasks
      .map((task) => {
        if (!task || typeof task !== "object" || Array.isArray(task)) {
          return null;
        }
        const item = task as Record<string, unknown>;
        const label = String(item.label || "").trim();
        return label
          ? {
            label,
            taskType: String(item.taskType || "validation").trim() || "validation"
          }
          : null;
      })
      .filter(Boolean) as Array<{ label: string; taskType: string }>
    : [];
  return cycleNo > 0 && tasks.length ? { cycleNo, tasks } : null;
}

function buildOpportunityTasksByStage(input: {
  stage: string;
  decisionStatus: string;
  nextValidationAction: string;
  lastValidationSignal: string;
}) {
  if (input.nextValidationAction && input.decisionStatus === "selected") {
    return [
      input.nextValidationAction,
      "跟进 3 个验证对象",
      input.lastValidationSignal ? "记录 1 条新的关键反对意见" : "补 1 条关键验证反馈"
    ];
  }

  switch (input.stage) {
    case "capturing":
      return [
        "补 3 条真实用户场景原话",
        "写下 1 个最想服务的人",
        "写清 1 个你最想解决的痛点"
      ];
    case "structuring":
      return [
        "写清一句“谁在什么场景下为什么会付钱”",
        "补 1 条价值主张",
        "补 1 个最具体的使用场景"
      ];
    case "scoring":
      return [
        "补 3 条支持证据",
        "补 3 条反对证据",
        "给当前机会打一版临时评分"
      ];
    case "comparing":
      return [
        "把 2 个机会放到一张表里比较",
        "选 1 个继续推进的机会",
        "写下放弃另一个机会的原因"
      ];
    case "validating":
      return [
        input.nextValidationAction || "生成 1 个本周验证动作",
        "跟进 3 个验证对象",
        "更新一次机会评分"
      ];
    default:
      return [
        "补 3 条真实用户场景原话",
        "写清一句“谁在什么场景下为什么会付钱”",
        "生成 1 个本周验证动作"
      ];
  }
}
