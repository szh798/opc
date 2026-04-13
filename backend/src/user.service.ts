import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "./shared/prisma.service";
import { DEMO_USER_ID } from "./shared/catalog";
import { DEMO_USER_TEMPLATE } from "./shared/templates";

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureDemoUser() {
    return this.prisma.user.upsert({
      where: {
        id: DEMO_USER_ID
      },
      create: {
        ...DEMO_USER_TEMPLATE
      },
      update: {
        name: DEMO_USER_TEMPLATE.name,
        nickname: DEMO_USER_TEMPLATE.nickname,
        initial: DEMO_USER_TEMPLATE.initial,
        stage: DEMO_USER_TEMPLATE.stage,
        streakDays: DEMO_USER_TEMPLATE.streakDays,
        subtitle: DEMO_USER_TEMPLATE.subtitle
      }
    });
  }

  async getUserOrDemo(userId?: string | null) {
    const resolvedUserId = String(userId || DEMO_USER_ID).trim() || DEMO_USER_ID;

    if (resolvedUserId === DEMO_USER_ID) {
      return this.ensureDemoUser();
    }

    const user = await this.prisma.user.findFirst({
      where: {
        id: resolvedUserId,
        deletedAt: null
      }
    });

    if (!user) {
      throw new NotFoundException(`User not found: ${resolvedUserId}`);
    }

    return user;
  }

  async getCurrentUser(userId: string) {
    const user = await this.getUserOrDemo(userId);
    return this.buildUserPayload(user);
  }

  async updateCurrentUser(userId: string, payload: Record<string, unknown>) {
    await this.getUserOrDemo(userId);

    const nextUser = await this.prisma.user.update({
      where: {
        id: userId
      },
      data: {
        name: readString(payload.name),
        nickname: readString(payload.nickname),
        initial: readString(payload.initial, 8),
        avatarUrl: readString(payload.avatarUrl, 2048),
        entryPath: readString(payload.entryPath, 64)
      }
    });

    return this.buildUserPayload(nextUser);
  }

  async setEntryPathIfEmpty(userId: string, entryPath: string) {
    const safeUserId = String(userId || "").trim();
    const safeEntryPath = String(entryPath || "").trim().slice(0, 64);
    if (!safeUserId || !safeEntryPath) return;
    await this.prisma.user.updateMany({
      where: { id: safeUserId, entryPath: null },
      data: { entryPath: safeEntryPath }
    });
  }

  // Phase 2·1 —— 业务流转状态字段写入（chatflow 完成 / 切换时调用）
  // 统一通过本方法更新 User 表上的 hasXxx/lastIncompleteXxx/activeXxx 字段，
  // 避免各 Service 分散写同样的 update，且 null/undefined 自动跳过。
  async updateFlowFlags(
    userId: string,
    patch: {
      hasAssetRadar?: boolean;
      hasOpportunityScores?: boolean;
      hasSelectedDirection?: boolean;
      hasBusinessHealth?: boolean;
      hasProductStructure?: boolean;
      hasPricingCard?: boolean;
      lastIncompleteFlow?: string | null;
      lastIncompleteStep?: string | null;
      activeChatflowId?: string | null;
      activeDifyConversationId?: string | null;
    }
  ): Promise<void> {
    const safeUserId = String(userId || "").trim();
    if (!safeUserId) return;

    const data: Record<string, unknown> = {};

    const pickBool = (key: keyof typeof patch) => {
      const value = patch[key];
      if (typeof value === "boolean") {
        data[key as string] = value;
      }
    };
    pickBool("hasAssetRadar");
    pickBool("hasOpportunityScores");
    pickBool("hasSelectedDirection");
    pickBool("hasBusinessHealth");
    pickBool("hasProductStructure");
    pickBool("hasPricingCard");

    const pickNullableString = (key: keyof typeof patch, maxLength: number) => {
      if (!(key in patch)) return;
      const value = patch[key];
      if (value === null) {
        data[key as string] = null;
        return;
      }
      if (typeof value === "string") {
        const trimmed = value.trim().slice(0, maxLength);
        data[key as string] = trimmed || null;
      }
    };
    pickNullableString("lastIncompleteFlow", 64);
    pickNullableString("lastIncompleteStep", 64);
    pickNullableString("activeChatflowId", 64);
    pickNullableString("activeDifyConversationId", 128);

    if (!Object.keys(data).length) return;

    await this.prisma.user.updateMany({
      where: { id: safeUserId, deletedAt: null },
      data: data as never
    });
  }

  buildUserPayload(user: {
    id: string;
    name: string;
    nickname: string;
    initial: string;
    stage: string | null;
    streakDays: number;
    subtitle: string | null;
    avatarUrl: string | null;
    loggedIn: boolean;
    loginMode: string | null;
    openId: string | null;
    unionId: string | null;
    lastLoginAt: Date | null;
  }) {
    return {
      id: user.id,
      name: user.name,
      nickname: user.nickname,
      initial: user.initial,
      stage: user.stage || "",
      streakDays: user.streakDays,
      subtitle: user.subtitle || "",
      avatarUrl: user.avatarUrl || "",
      loggedIn: !!user.loggedIn,
      loginMode: user.loginMode || "",
      openId: user.openId || "",
      unionId: user.unionId || "",
      lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : ""
    };
  }
}

function readString(value: unknown, maxLength = 120) {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  return trimmed.slice(0, maxLength);
}
