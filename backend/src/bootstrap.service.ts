import { Injectable } from "@nestjs/common";
import { PrismaService } from "./shared/prisma.service";
import { cloneJson } from "./shared/json";
import { DEFAULT_TOOLS } from "./shared/catalog";
import { OpportunityService } from "./opportunity/opportunity.service";
import { UserService } from "./user.service";
import { ProfileService } from "./profile.service";
import { normalizeKnownMojibake } from "./shared/text-normalizer";

@Injectable()
export class BootstrapService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly userService: UserService,
    private readonly profileService: ProfileService,
    private readonly opportunityService: OpportunityService
  ) {}

  async getBootstrap(userId?: string | null) {
    // 匿名请求(无 token / userId 为空)直接返回空态,
    // 避免未登录用户看到任何历史项目或对话的伪登录假象。
    // 已登录请求带 userId 才走原有数据装配流程。
    const safeUserId = String(userId || "").trim();
    if (!safeUserId) {
      return this.buildAnonymousBootstrap();
    }

    const user = await this.userService.requireUser(safeUserId);
    const [projects, recentChats, assetInventoryStatus, opportunityState] = await Promise.all([
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
          deletedAt: null,
          messages: { some: {} }
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
      })),
      this.opportunityService.getOpportunityState(user.id)
    ]);

    return {
      user: this.userService.buildUserPayload(user),
      projects,
      tools: cloneJson(DEFAULT_TOOLS),
      recentChats: recentChats.map((item) => ({
        ...item,
        label: normalizeKnownMojibake(item.label)
      })),
      assetInventoryStatus,
      opportunityState
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
        lastLoginAt: "",
        onboardingCompleted: false,
        hasAssetRadar: false,
        hasOpportunityScores: false,
        hasSelectedDirection: false
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
      },
      opportunityState: {
        phase2Route: "onboarding_flow" as const,
        focusProject: null,
        primaryAction: "opportunity_continue_identify",
        secondaryActions: ["opportunity_refresh_assets", "opportunity_free_chat"],
        phaseSummaryCopy: "先完成登录和资产盘点，我们再进入机会识别。"
      }
    };
  }
}
