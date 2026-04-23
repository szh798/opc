import { Prisma } from "@prisma/client";
import { Injectable, NotFoundException } from "@nestjs/common";
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
    private readonly growthService: GrowthService
  ) {}

  async getDailyTasks(userId: string) {
    await this.userService.requireUser(userId);
    await this.ensureDailyTasks(userId);

    const items = await this.prisma.dailyTask.findMany({
      where: {
        userId
      },
      orderBy: {
        createdAt: "asc"
      }
    });

    return {
      title: "今日任务",
      items: items.map((item) => ({
        id: item.id,
        label: item.label,
        tag: item.tag || "",
        done: !!item.done
      }))
    };
  }

  async completeTask(userId: string, taskId: string, payload: Record<string, unknown>) {
    await this.ensureDailyTasks(userId);

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
        completedAt: new Date()
      }
    });
    await this.growthService.touch(userId).catch(() => undefined);

    return {
      success: true,
      taskId,
      done: true,
      payload
    };
  }

  async buildTaskFeedback(userId: string, payload: Record<string, unknown>) {
    const taskLabel = String(payload.taskLabel || payload.label || "这项任务");
    const summary = String(payload.summary || payload.userText || payload.text || "");
    const advice = buildTaskFeedbackAdvice(summary, taskLabel);

    await this.prisma.taskFeedback.create({
      data: {
        userId,
        taskId: readString(payload.taskId, 128),
        taskLabel,
        summary,
        advice,
        payload: payload as Prisma.InputJsonValue
      }
    });
    await this.growthService.touch(userId).catch(() => undefined);

    return {
      messages: [
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
      ],
      quickReplies: getTaskFeedbackReplies()
    };
  }

  private async ensureDailyTasks(userId: string) {
    const count = await this.prisma.dailyTask.count({
      where: {
        userId
      }
    });

    if (count > 0) {
      return;
    }

    await this.prisma.dailyTask.createMany({
      data: DEFAULT_DAILY_TASKS.map((task) => ({
        id: `${userId}-${task.id}`,
        userId,
        label: task.label,
        tag: task.tag
      }))
    });
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
