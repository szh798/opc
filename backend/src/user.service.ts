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
        avatarUrl: readString(payload.avatarUrl, 2048)
      }
    });

    return this.buildUserPayload(nextUser);
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
