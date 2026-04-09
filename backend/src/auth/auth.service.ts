import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../shared/prisma.service";
import { getAppConfig } from "../shared/app-config";
import { DEMO_USER_TEMPLATE } from "../shared/templates";
import { UserService } from "../user.service";
import { Code2SessionResponse, WechatMiniProgramUserProfile, WechatService } from "./wechat.service";

type RefreshSessionPayload = {
  sub: string;
  sid: string;
  typ: string;
};

type WechatLoginPayload = {
  code?: string;
  simulateFreshUser?: boolean;
  encryptedData?: string;
  iv?: string;
};

function parseDurationToSeconds(value: string, fallback: number) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) {
    return fallback;
  }

  if (/^\d+$/.test(normalized)) {
    return Number(normalized);
  }

  const match = normalized.match(/^(\d+)\s*(s|m|h|d)$/);
  if (!match) {
    return fallback;
  }

  const amount = Number(match[1]);
  const unit = match[2];
  const multipliers: Record<string, number> = {
    s: 1,
    m: 60,
    h: 3600,
    d: 86400
  };

  return amount * (multipliers[unit] || 1);
}

@Injectable()
export class AuthService {
  private readonly config = getAppConfig();
  private readonly accessTokenExpiresIn = parseDurationToSeconds(this.config.accessTokenTtl, 7200);
  private readonly refreshTokenExpiresIn = parseDurationToSeconds(this.config.refreshTokenTtl, 30 * 24 * 3600);

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly userService: UserService,
    private readonly wechatService: WechatService
  ) {}

  private buildWechatUserPatch(
    session: Code2SessionResponse,
    profile: WechatMiniProgramUserProfile | null
  ): Record<string, unknown> {
    const patch: Record<string, unknown> = {
      loggedIn: true,
      loginMode: "wechat-miniprogram",
      lastLoginAt: new Date()
    };

    const openId = String(profile?.openId || session.openid || "").trim();
    const unionId = String(profile?.unionId || session.unionid || "").trim();
    const nickname = String(profile?.nickName || "").trim();
    const avatarUrl = String(profile?.avatarUrl || "").trim();
    const country = String(profile?.country || "").trim();
    const province = String(profile?.province || "").trim();
    const city = String(profile?.city || "").trim();
    const language = String(profile?.language || "").trim();

    if (openId) {
      patch.openId = openId;
    }

    if (unionId) {
      patch.unionId = unionId;
    }

    if (nickname) {
      patch.name = nickname;
      patch.nickname = nickname;
      patch.initial = nickname.slice(0, 1);
    }

    if (avatarUrl) {
      patch.avatarUrl = avatarUrl;
    }

    if (typeof profile?.gender === "number") {
      patch.gender = profile.gender;
    }

    if (country) {
      patch.country = country;
    }

    if (province) {
      patch.province = province;
    }

    if (city) {
      patch.city = city;
    }

    if (language) {
      patch.language = language;
    }

    return patch;
  }

  private buildMockWechatUserPatch() {
    return {
      loggedIn: true,
      loginMode: "mock-wechat",
      lastLoginAt: new Date()
    };
  }

  private buildDevFreshUserPatch() {
    return {
      loggedIn: true,
      loginMode: "dev-fresh-user",
      lastLoginAt: new Date()
    };
  }

  private async createDevFreshUser(base: Record<string, unknown> = {}) {
    const nickname = String(base.nickname || base.name || DEMO_USER_TEMPLATE.nickname || "新用户").trim() || "新用户";

    return this.prisma.user.create({
      data: {
        id: `user-${randomUUID()}`,
        name: nickname,
        nickname,
        initial: String(base.initial || nickname.slice(0, 1) || "新"),
        stage: String(base.stage || DEMO_USER_TEMPLATE.stage || "").trim() || null,
        streakDays: Number.isFinite(Number(base.streakDays)) ? Number(base.streakDays) : DEMO_USER_TEMPLATE.streakDays,
        subtitle: String(base.subtitle || DEMO_USER_TEMPLATE.subtitle || "").trim() || null,
        avatarUrl: String(base.avatarUrl || "").trim() || null,
        openId: String(base.openId || "").trim() || null,
        unionId: String(base.unionId || "").trim() || null,
        gender: typeof base.gender === "number" ? base.gender : null,
        country: String(base.country || "").trim() || null,
        province: String(base.province || "").trim() || null,
        city: String(base.city || "").trim() || null,
        language: String(base.language || "").trim() || null,
        ...this.buildDevFreshUserPatch()
      }
    });
  }

  private async issueTokens(userId: string) {
    const sessionId = randomUUID();
    const accessTokenExpiresAt = new Date(Date.now() + this.accessTokenExpiresIn * 1000);
    const refreshTokenExpiresAt = new Date(Date.now() + this.refreshTokenExpiresIn * 1000);

    const accessToken = this.jwtService.sign(
      {
        sub: userId,
        sid: sessionId,
        typ: "access"
      },
      {
        secret: this.config.jwtSecret,
        expiresIn: this.config.accessTokenTtl as never
      }
    );

    const refreshToken = this.jwtService.sign(
      {
        sub: userId,
        sid: sessionId,
        typ: "refresh"
      },
      {
        secret: this.config.jwtSecret,
        expiresIn: this.config.refreshTokenTtl as never
      }
    );

    await this.prisma.session.create({
      data: {
        id: sessionId,
        userId,
        refreshToken,
        accessTokenExpiresAt,
        refreshTokenExpiresAt
      }
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: this.accessTokenExpiresIn
    };
  }

  private verifyToken<T extends RefreshSessionPayload>(token: string) {
    try {
      return this.jwtService.verify<T>(token, {
        secret: this.config.jwtSecret
      });
    } catch (_error) {
      throw new UnauthorizedException("Invalid token");
    }
  }

  private async revokeSessionById(sessionId?: string) {
    if (!sessionId) {
      return;
    }

    await this.prisma.session.updateMany({
      where: {
        id: sessionId,
        revokedAt: null
      },
      data: {
        revokedAt: new Date()
      }
    });
  }

  private async findWechatIdentity(openId?: string, unionId?: string) {
    const filters: Array<{ openId?: string; unionId?: string }> = [];

    if (openId) {
      filters.push({ openId });
    }

    if (unionId) {
      filters.push({ unionId });
    }

    if (!filters.length) {
      return null;
    }

    return this.prisma.wechatIdentity.findFirst({
      where: {
        OR: filters
      }
    });
  }

  private async upsertWechatIdentity(
    userId: string,
    openId?: string,
    unionId?: string,
    sessionKey?: string
  ) {
    const existing = await this.findWechatIdentity(openId, unionId);

    if (existing) {
      return this.prisma.wechatIdentity.update({
        where: {
          id: existing.id
        },
        data: {
          userId,
          openId: openId || existing.openId,
          unionId: unionId || existing.unionId,
          sessionKey: sessionKey || existing.sessionKey
        }
      });
    }

    return this.prisma.wechatIdentity.create({
      data: {
        userId,
        openId,
        unionId,
        sessionKey
      }
    });
  }

  private async ensureMockUser() {
    return this.prisma.user.upsert({
      where: {
        id: DEMO_USER_TEMPLATE.id
      },
      create: {
        ...DEMO_USER_TEMPLATE,
        ...this.buildMockWechatUserPatch()
      },
      update: this.buildMockWechatUserPatch()
    });
  }

  async loginByWechat(payload: WechatLoginPayload = {}) {
    const code = String(payload.code || "").trim();
    const encryptedData = String(payload.encryptedData || "").trim();
    const iv = String(payload.iv || "").trim();
    const canFallbackToMock = this.config.allowMockWechatLogin && !this.wechatService.isConfigured();
    const shouldSimulateFreshUser =
      this.config.allowDevFreshUserLogin && payload.simulateFreshUser === true;

    if ((encryptedData && !iv) || (!encryptedData && iv)) {
      throw new UnauthorizedException("WeChat encryptedData and iv must be provided together");
    }

    if (code && this.wechatService.isConfigured()) {
      const session = await this.wechatService.code2Session(code);
      const profile =
        encryptedData && iv
          ? this.wechatService.decryptMiniProgramUserProfile({
              encryptedData,
              iv,
              sessionKey: session.session_key || ""
            })
          : null;

      const openId = String(profile?.openId || session.openid || "").trim();
      const unionId = String(profile?.unionId || session.unionid || "").trim();
      let userId = "";

      if (shouldSimulateFreshUser) {
        const freshUser = await this.createDevFreshUser({
          ...this.buildWechatUserPatch(session, profile),
          name: String(profile?.nickName || DEMO_USER_TEMPLATE.name),
          nickname: String(profile?.nickName || DEMO_USER_TEMPLATE.nickname),
          initial: String((profile?.nickName || DEMO_USER_TEMPLATE.initial).slice(0, 1)),
          stage: DEMO_USER_TEMPLATE.stage,
          streakDays: DEMO_USER_TEMPLATE.streakDays,
          subtitle: DEMO_USER_TEMPLATE.subtitle
        });
        userId = freshUser.id;
      } else {
        const existingIdentity = await this.findWechatIdentity(openId, unionId);
        userId = existingIdentity?.userId || `user-${randomUUID()}`;

        await this.prisma.user.upsert({
          where: {
            id: userId
          },
          create: {
            id: userId,
            name: String(profile?.nickName || DEMO_USER_TEMPLATE.name),
            nickname: String(profile?.nickName || DEMO_USER_TEMPLATE.nickname),
            initial: String((profile?.nickName || DEMO_USER_TEMPLATE.initial).slice(0, 1)),
            stage: DEMO_USER_TEMPLATE.stage,
            streakDays: DEMO_USER_TEMPLATE.streakDays,
            subtitle: DEMO_USER_TEMPLATE.subtitle,
            ...this.buildWechatUserPatch(session, profile)
          },
          update: this.buildWechatUserPatch(session, profile)
        });

        await this.upsertWechatIdentity(
          userId,
          openId || undefined,
          unionId || undefined,
          session.session_key
        );
      }

      const user = await this.userService.getUserOrDemo(userId);
      const tokens = await this.issueTokens(userId);

      return {
        ...tokens,
        user: this.userService.buildUserPayload(user)
      };
    }

    if (this.config.allowMockWechatLogin || canFallbackToMock) {
      const user = shouldSimulateFreshUser
        ? await this.createDevFreshUser({
            ...DEMO_USER_TEMPLATE,
            ...this.buildMockWechatUserPatch()
          })
        : await this.ensureMockUser();
      const tokens = await this.issueTokens(user.id);

      return {
        ...tokens,
        user: this.userService.buildUserPayload(user)
      };
    }

    throw new UnauthorizedException("WeChat login requires a valid code and configured credentials");
  }

  async refreshAccessToken(refreshToken?: string) {
    const token = String(refreshToken || "").trim();
    if (!token) {
      throw new UnauthorizedException("Invalid refresh token");
    }

    const payload = this.verifyToken<RefreshSessionPayload>(token);
    if (payload.typ !== "refresh") {
      throw new UnauthorizedException("Invalid refresh token type");
    }

    const session = await this.prisma.session.findFirst({
      where: {
        id: payload.sid,
        userId: payload.sub,
        refreshToken: token,
        revokedAt: null
      }
    });

    if (!session || session.refreshTokenExpiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException("Invalid refresh token");
    }

    await this.revokeSessionById(session.id);
    return this.issueTokens(payload.sub);
  }

  async resolveUserFromAuthorization(authorization?: string) {
    const token = String(authorization || "").replace(/^Bearer\s+/i, "").trim();
    if (!token) {
      return null;
    }

    const payload = this.verifyToken<RefreshSessionPayload>(token);
    if (payload.typ !== "access") {
      return null;
    }

    const session = await this.prisma.session.findFirst({
      where: {
        id: payload.sid,
        userId: payload.sub,
        revokedAt: null
      }
    });

    if (!session || session.accessTokenExpiresAt.getTime() <= Date.now()) {
      return null;
    }

    const user = await this.prisma.user.findFirst({
      where: {
        id: payload.sub,
        deletedAt: null
      }
    });

    if (!user) {
      return null;
    }

    return this.userService.buildUserPayload(user);
  }

  async logout(refreshToken?: string, authorization?: string) {
    const authToken = String(authorization || "").replace(/^Bearer\s+/i, "").trim();
    const refresh = String(refreshToken || "").trim();

    if (authToken) {
      try {
        const payload = this.verifyToken<RefreshSessionPayload>(authToken);
        await this.revokeSessionById(payload.sid);
      } catch (_error) {
        // ignore invalid access token on logout
      }
    }

    if (refresh) {
      try {
        const payload = this.verifyToken<RefreshSessionPayload>(refresh);
        await this.revokeSessionById(payload.sid);
      } catch (_error) {
        await this.prisma.session.updateMany({
          where: {
            refreshToken: refresh,
            revokedAt: null
          },
          data: {
            revokedAt: new Date()
          }
        });
      }
    }

    return {
      success: true
    };
  }
}
