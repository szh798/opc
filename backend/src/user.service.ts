import { Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { ContentSecurityService } from "./shared/content-security.service";
import { PrismaService } from "./shared/prisma.service";

@Injectable()
export class UserService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contentSecurity: ContentSecurityService
  ) {}

  async requireUser(userId?: string | null) {
    const resolvedUserId = String(userId || "").trim();
    if (!resolvedUserId) {
      // 空 id = 未登录 / 匿名访问，必须 401，而不是 404。
      // 否则 bootstrap 这类接口会被误判为"用户不存在"继续 fallback 到 demo 数据。
      throw new UnauthorizedException("Unauthorized");
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
    const user = await this.requireUser(userId);
    return this.buildUserPayload(user);
  }

  async updateCurrentUser(userId: string, payload: Record<string, unknown>) {
    const existing = await this.requireUser(userId);

    // Phase A1 内容安全：昵称 / 真名若有更新，必须过一次微信内容审核，
    // 拒绝存入含违规昵称（"党中央"/涉黄等）的用户资料，避免后续作为 sidebar /
    // 分享海报文本再次暴露给其他用户。
    const nextName = readString(payload.name);
    const nextNickname = readString(payload.nickname);
    const openId = existing.openId || "";

    for (const [field, value] of [
      ["name", nextName],
      ["nickname", nextNickname]
    ] as const) {
      if (!value) continue;
      const result = await this.contentSecurity.checkText(value, {
        openId,
        scene: 1,
        label: `user.profile.${field}`
      });
      if (!result.pass) {
        throw this.contentSecurity.buildRejectionException(
          result,
          field === "nickname" ? "昵称" : "姓名"
        );
      }
    }

    const nextUser = await this.prisma.user.update({
      where: {
        id: userId
      },
      data: {
        name: nextName,
        nickname: nextNickname,
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
    role?: string | null;
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
      role: user.role || "user",
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
