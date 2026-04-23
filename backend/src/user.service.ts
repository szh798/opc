import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import * as path from "node:path";
import { getAppConfig } from "./shared/app-config";
import { ContentSecurityService } from "./shared/content-security.service";
import { PrismaService } from "./shared/prisma.service";

@Injectable()
export class UserService {
  private readonly config = getAppConfig();
  private readonly logger = new Logger(UserService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly contentSecurity: ContentSecurityService
  ) {}

  async getUserOrDemo(userId?: string | null) {
    return this.requireUser(userId);
  }

  async requireUser(userId?: string | null) {
    const resolvedUserId = String(userId || "").trim();
    if (!resolvedUserId) {
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

  async uploadCurrentUserAvatar(userId: string, avatarDataUrl: string) {
    let avatarPath = "";
    try {
      const user = await this.requireUser(userId);
      const avatarAsset = parseAvatarDataUrl(avatarDataUrl);
      const avatarsDir = path.join(this.config.storageDir, "avatars");
      const avatarFileName = `avatar-${userId}-${randomUUID()}.${avatarAsset.extension}`;
      avatarPath = path.join(avatarsDir, avatarFileName);
      const avatarUrl = `${this.config.publicBaseUrl.replace(/\/+$/, "")}/user/avatars/${avatarFileName}`;

      await mkdir(avatarsDir, {
        recursive: true
      });
      await writeFile(avatarPath, avatarAsset.buffer);

      const nextUser = await this.prisma.user.update({
        where: {
          id: userId
        },
        data: {
          avatarUrl
        }
      });

      await this.cleanupStoredAvatar(user.avatarUrl);

      return this.buildUserPayload(nextUser);
    } catch (error) {
      if (avatarPath) {
        await this.removeAvatarFile(avatarPath);
      }
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException ||
        error instanceof ServiceUnavailableException
      ) {
        throw error;
      }
      this.logger.error(
        `uploadCurrentUserAvatar failed for ${userId}: ${error instanceof Error ? error.message : String(error)}`
      );
      throw new ServiceUnavailableException("Avatar upload is temporarily unavailable");
    }
  }

  async getAvatar(avatarName: string) {
    const safeAvatarName = sanitizeAvatarName(avatarName);
    if (!safeAvatarName) {
      throw new NotFoundException("Avatar not found");
    }

    const avatarPath = path.join(this.config.storageDir, "avatars", safeAvatarName);
    try {
      return {
        buffer: await readFile(avatarPath),
        mimeType: resolveAvatarMimeType(safeAvatarName)
      };
    } catch (_error) {
      throw new NotFoundException("Avatar not found");
    }
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
    onboardingCompleted?: boolean | null;
    hasAssetRadar?: boolean | null;
    hasOpportunityScores?: boolean | null;
    hasSelectedDirection?: boolean | null;
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
      onboardingCompleted: !!user.onboardingCompleted,
      hasAssetRadar: !!user.hasAssetRadar,
      hasOpportunityScores: !!user.hasOpportunityScores,
      hasSelectedDirection: !!user.hasSelectedDirection,
      lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : ""
    };
  }

  private async cleanupStoredAvatar(avatarUrl?: string | null) {
    const safeAvatarUrl = String(avatarUrl || "").trim();
    if (!safeAvatarUrl) {
      return;
    }

    const publicPrefix = `${this.config.publicBaseUrl.replace(/\/+$/, "")}/user/avatars/`;
    if (!safeAvatarUrl.startsWith(publicPrefix)) {
      return;
    }

    const avatarName = sanitizeAvatarName(safeAvatarUrl.slice(publicPrefix.length).split(/[?#]/)[0] || "");
    if (!avatarName) {
      return;
    }

    const avatarPath = path.join(this.config.storageDir, "avatars", avatarName);
    try {
      await unlink(avatarPath);
    } catch (_error) {
      // Ignore cleanup failures for stale avatar files.
    }
  }

  private async removeAvatarFile(avatarPath: string) {
    try {
      await unlink(avatarPath);
    } catch (_error) {
      // Ignore cleanup failures for failed avatar uploads.
    }
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

function parseAvatarDataUrl(source: string) {
  const payload = String(source || "").trim();
  const match = /^data:(image\/(?:png|jpeg|jpg|webp));base64,([a-z0-9+/=\r\n]+)$/i.exec(payload);

  if (!match) {
    throw new BadRequestException("Invalid avatar payload");
  }

  const mimeType = normalizeAvatarMimeType(match[1]);
  const buffer = Buffer.from(match[2].replace(/\s+/g, ""), "base64");

  if (!buffer.length) {
    throw new BadRequestException("Avatar payload is empty");
  }

  if (buffer.length > 4 * 1024 * 1024) {
    throw new BadRequestException("Avatar image is too large");
  }

  return {
    buffer,
    mimeType,
    extension: mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg"
  };
}

function sanitizeAvatarName(value: string) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return "";
  }

  const baseName = path.basename(normalized);
  if (baseName !== normalized) {
    return "";
  }

  return /^[a-zA-Z0-9._-]+$/.test(baseName) ? baseName : "";
}

function normalizeAvatarMimeType(value: string) {
  const mimeType = String(value || "").trim().toLowerCase();
  if (mimeType === "image/png") return "image/png";
  if (mimeType === "image/webp") return "image/webp";
  return "image/jpeg";
}

function resolveAvatarMimeType(fileName: string) {
  const extension = String(fileName || "").trim().split(".").pop()?.toLowerCase();
  if (extension === "png") {
    return "image/png";
  }
  if (extension === "webp") {
    return "image/webp";
  }
  return "image/jpeg";
}
