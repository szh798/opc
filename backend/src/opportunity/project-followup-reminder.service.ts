import { Injectable, Logger } from "@nestjs/common";
import { WechatService } from "../auth/wechat.service";
import { PrismaService } from "../shared/prisma.service";

type FollowupCycleReminderPayload = {
  userId: string;
  projectId: string;
  cycle: {
    cycleNo?: number;
    goal?: string;
    nextRecommendation?: string;
    tasks?: Array<{ label?: string }>;
  };
};

@Injectable()
export class ProjectFollowupReminderService {
  private readonly logger = new Logger(ProjectFollowupReminderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly wechatService: WechatService
  ) {}

  enqueueProjectFollowupReminder(payload: FollowupCycleReminderPayload) {
    setTimeout(() => {
      void this.sendProjectFollowupReminder(payload).catch((error) => {
        this.logger.warn(`project followup reminder failed: ${error instanceof Error ? error.message : String(error)}`);
      });
    }, 0);
  }

  async sendProjectFollowupReminder(payload: FollowupCycleReminderPayload) {
    const userId = String(payload.userId || "").trim();
    const projectId = String(payload.projectId || "").trim();
    if (!userId || !projectId) {
      return { sent: false, reason: "missing_identity" };
    }

    const project = await this.prisma.project.findFirst({
      where: {
        id: projectId,
        userId,
        deletedAt: null,
        projectKind: "active_project"
      },
      select: {
        id: true,
        name: true,
        user: {
          select: {
            id: true,
            openId: true,
            wechatOpenid: true,
            lastActiveAt: true,
            wechatIdentities: {
              where: {
                openId: {
                  not: null
                }
              },
              select: {
                openId: true
              },
              orderBy: {
                updatedAt: "desc"
              },
              take: 1
            }
          }
        }
      }
    });

    if (!project) {
      return { sent: false, reason: "project_not_found" };
    }

    if (wasRecentlyActive(project.user.lastActiveAt)) {
      return { sent: false, reason: "recently_active" };
    }

    const openId = resolveUserOpenId(project.user);
    if (!openId) {
      return { sent: false, reason: "missing_openid" };
    }

    const token = await this.prisma.subscriptionToken.findFirst({
      where: {
        userId,
        scene: "followup",
        status: "available",
        sendStatus: "pending",
        consumedAt: null,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } }
        ]
      },
      orderBy: {
        grantedAt: "asc"
      }
    });

    if (!token) {
      return { sent: false, reason: "missing_subscription" };
    }

    const now = new Date();
    const locked = await this.prisma.subscriptionToken.updateMany({
      where: {
        id: token.id,
        status: "available",
        sendStatus: "pending",
        consumedAt: null
      },
      data: {
        sendStatus: "sending",
        triggeredAt: now
      }
    });

    if (!locked.count) {
      return { sent: false, reason: "subscription_already_claimed" };
    }

    const result = await this.wechatService.sendSubscribeMessage({
      openId,
      templateId: token.templateId,
      page: `pages/project-detail/project-detail?id=${encodeURIComponent(project.id)}`,
      data: buildFollowupTemplateData(project.name, payload.cycle)
    });

    if (result.errcode === 0) {
      await this.prisma.subscriptionToken.update({
        where: { id: token.id },
        data: {
          status: "used",
          consumedAt: now,
          usedAt: now,
          sendStatus: "sent"
        }
      });
      return { sent: true, tokenId: token.id };
    }

    await this.prisma.subscriptionToken.update({
      where: { id: token.id },
      data: {
        sendStatus: "failed"
      }
    });
    this.logger.warn(`project followup reminder rejected by WeChat: ${result.errcode} ${result.errmsg || ""}`.trim());
    return {
      sent: false,
      reason: "wechat_rejected",
      errcode: result.errcode,
      errmsg: result.errmsg || ""
    };
  }
}

function resolveUserOpenId(user: {
  openId: string | null;
  wechatOpenid: string | null;
  wechatIdentities: Array<{ openId: string | null }>;
}) {
  return String(user.openId || user.wechatOpenid || user.wechatIdentities[0]?.openId || "").trim();
}

function wasRecentlyActive(lastActiveAt: Date | null) {
  if (!lastActiveAt) {
    return false;
  }

  return Date.now() - lastActiveAt.getTime() < 12 * 60 * 60 * 1000;
}

function buildFollowupTemplateData(
  projectName: string,
  cycle: FollowupCycleReminderPayload["cycle"]
): Record<string, { value: string }> {
  const firstTask = Array.isArray(cycle.tasks) ? String(cycle.tasks[0]?.label || "") : "";
  return {
    thing1: { value: limitWechatThing(projectName || "当前项目") },
    thing2: { value: limitWechatThing(cycle.goal || firstTask || "本轮跟进任务已更新") },
    time3: { value: formatBeijingTime(new Date()) },
    thing4: { value: limitWechatThing(cycle.nextRecommendation || firstTask || "打开项目查看下一步") }
  };
}

function limitWechatThing(value: string, maxLength = 20) {
  const normalized = String(value || "")
    .replace(/\s+/g, " ")
    .trim();
  return Array.from(normalized || "项目跟进").slice(0, maxLength).join("");
}

function formatBeijingTime(date: Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date).replace(/\//g, "-");
}
