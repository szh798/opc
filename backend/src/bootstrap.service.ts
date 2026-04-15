import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { PrismaService } from "./shared/prisma.service";
import { cloneJson } from "./shared/json";
import { DEFAULT_TOOLS, DEMO_USER_ID } from "./shared/catalog";
import { UserService } from "./user.service";
import { ProfileService } from "./profile.service";
import { normalizeKnownMojibake } from "./shared/text-normalizer";

@Injectable()
export class BootstrapService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly userService: UserService,
    private readonly profileService: ProfileService
  ) {}

  async getBootstrap(userId?: string | null) {
    // 匿名请求(无 token / userId 为空)不再 fallback 到 DEMO_USER_ID,
    // 否则未登录用户会看到"小明"及其种子项目 / 历史对话,造成伪登录假象。
    // 已登录请求带 userId 才走原有数据装配流程。
    const safeUserId = String(userId || "").trim();
    if (!safeUserId) {
      return this.buildAnonymousBootstrap();
    }

    const user = await this.userService.getUserOrDemo(safeUserId);
    if (user.loginMode !== "dev-fresh-user") {
      await this.ensureStarterWorkspace(user.id);
    }
    const [projects, recentChats, assetInventoryStatus] = await Promise.all([
      this.prisma.project.findMany({
        where: {
          userId: user.id,
          deletedAt: null
        },
        select: {
          id: true,
          name: true,
          phase: true,
          status: true,
          statusTone: true,
          color: true
        },
        orderBy: {
          updatedAt: "desc"
        }
      }),
      this.prisma.conversation.findMany({
        where: {
          userId: user.id,
          deletedAt: null
        },
        select: {
          id: true,
          label: true
        },
        orderBy: {
          updatedAt: "desc"
        },
        take: 10
      }),
      this.profileService.getAssetResumeStatus(user.id).catch(() => ({
        hasReport: false,
        inProgress: false,
        workflowKey: "firstInventory" as const,
        lastConversationId: null,
        resumePrompt: null
      }))
    ]);

    return {
      user: this.userService.buildUserPayload(user),
      projects,
      tools: cloneJson(DEFAULT_TOOLS),
      recentChats: recentChats.map((item) => ({
        ...item,
        label: normalizeKnownMojibake(item.label)
      })),
      assetInventoryStatus
    };
  }

  async getSidebar(userId?: string | null) {
    return this.getBootstrap(userId);
  }

  private buildAnonymousBootstrap() {
    return {
      user: {
        id: "",
        name: "",
        nickname: "",
        initial: "",
        stage: "",
        streakDays: 0,
        subtitle: "",
        avatarUrl: "",
        loggedIn: false,
        loginMode: "",
        openId: "",
        unionId: "",
        lastLoginAt: ""
      },
      projects: [] as Array<never>,
      tools: cloneJson(DEFAULT_TOOLS),
      recentChats: [] as Array<never>,
      assetInventoryStatus: {
        hasReport: false,
        inProgress: false,
        workflowKey: "firstInventory" as const,
        lastConversationId: null,
        resumePrompt: null
      }
    };
  }

  private async ensureStarterWorkspace(userId: string) {
    const safeUserId = String(userId || "").trim();
    if (!safeUserId || safeUserId === DEMO_USER_ID) {
      return;
    }

    const [projectCount, conversationCount] = await Promise.all([
      this.prisma.project.count({
        where: {
          userId: safeUserId,
          deletedAt: null
        }
      }),
      this.prisma.conversation.count({
        where: {
          userId: safeUserId,
          deletedAt: null
        }
      })
    ]);

    const minStarterRecentChats = 3;

    if (projectCount > 0 && conversationCount >= minStarterRecentChats) {
      return;
    }

    const [demoProjects, demoConversations] = await Promise.all([
      projectCount === 0
        ? this.prisma.project.findMany({
            where: {
              userId: DEMO_USER_ID,
              deletedAt: null
            },
            include: {
              artifacts: {
                where: {
                  deletedAt: null
                },
                orderBy: {
                  createdAt: "asc"
                }
              }
            },
            orderBy: {
              updatedAt: "asc"
            }
          })
        : Promise.resolve([]),
      conversationCount < minStarterRecentChats
        ? this.prisma.conversation.findMany({
            where: {
              userId: DEMO_USER_ID,
              deletedAt: null
            },
            orderBy: {
              updatedAt: "desc"
            },
            take: Math.max(0, minStarterRecentChats - conversationCount)
          })
        : Promise.resolve([])
    ]);

    const operations = [];

    for (const project of demoProjects) {
      const nextProjectId = `project-${randomUUID()}`;
      operations.push(
        this.prisma.project.create({
          data: {
            id: nextProjectId,
            userId: safeUserId,
            name: project.name,
            phase: project.phase,
            status: project.status,
            statusTone: project.statusTone,
            color: project.color,
            agentLabel: project.agentLabel,
            conversation: toNullableJsonInput(project.conversation),
            conversationReplies: toNullableJsonInput(project.conversationReplies)
          }
        })
      );

      for (const artifact of project.artifacts) {
        operations.push(
          this.prisma.projectArtifact.create({
            data: {
              id: `artifact-${randomUUID()}`,
              projectId: nextProjectId,
              type: artifact.type,
              title: artifact.title,
              data: toNullableJsonInput(artifact.data),
              meta: artifact.meta,
              summary: artifact.summary,
              cta: toNullableJsonInput(artifact.cta)
            }
          })
        );
      }
    }

    for (const conversation of demoConversations) {
      operations.push(
        this.prisma.conversation.create({
          data: {
            id: `conv-${randomUUID()}`,
            userId: safeUserId,
            sceneKey: conversation.sceneKey,
            label: normalizeKnownMojibake(conversation.label),
            lastMessageAt: conversation.lastMessageAt,
            createdAt: conversation.createdAt,
            updatedAt: conversation.updatedAt
          }
        })
      );
    }

    if (!operations.length) {
      return;
    }

    await this.prisma.$transaction(operations);
  }
}

function toNullableJsonInput(value: Prisma.JsonValue | null | undefined) {
  if (value === null) {
    return Prisma.JsonNull;
  }

  if (typeof value === "undefined") {
    return undefined;
  }

  return value as Prisma.InputJsonValue;
}
