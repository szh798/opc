import { Prisma } from "@prisma/client";
import { Injectable, NotFoundException } from "@nestjs/common";
import { OpportunityService } from "./opportunity/opportunity.service";
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
    private readonly opportunityService: OpportunityService
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

    if (action === "replace" || action === "skipped") {
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
    estimate_minutes: 15,
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
          { key: "feedback", label: "补充反馈", primary: true },
          { key: "review", label: "判断信号" }
        ];
      }
      if (type.includes("validation") || /客户|潜在|触达|问他们/.test(taskLabel)) {
        return [
          { key: "feedback", label: "补充反馈", primary: true },
          { key: "review", label: "复盘客户" }
        ];
      }
      return [
        { key: "feedback", label: "补充反馈", primary: true },
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
        { key: "complete", label: "完成" },
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
