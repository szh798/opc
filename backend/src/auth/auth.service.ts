import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../shared/prisma.service";
import { getAppConfig } from "../shared/app-config";
import { DEFAULT_USER_TEMPLATE } from "../shared/templates";
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
  nickname?: string;
  avatarUrl?: string;
};

// 当前端没能通过 wx.getUserProfile 拿到真实微信昵称时(wx.getUserProfile 自
// 2022-10 已被微信废弃,所有新用户实际上都会走到这里),生成一个京东式的不透明
// 可读 ID 作为展示昵称,不再 fallback 到静态示例昵称,避免新
// 用户和 demo 账号同名导致的伪登录错觉。格式:opc_a1b2c3d4e5(10 位小写 hex)
function buildFreshNicknamePlaceholder() {
  const suffix = randomUUID().replace(/-/g, "").slice(0, 10).toLowerCase();
  return `opc_${suffix}`;
}

// 微信 2022-10 之后废弃了 wx.getUserProfile,但授权仍会返回一个占位名称
// "微信用户" (某些旧版本也会返回 "WeChatUser" / "wx-user")。这些并不是用户
// 真实昵称,如果原样落库用户会看到一群同名账号。把这些占位值当作"拿不到昵称"
// 处理,让上层逻辑走 buildFreshNicknamePlaceholder() 的 opc_ 动态占位分支。
const WECHAT_PLACEHOLDER_NICKNAMES = new Set([
  "微信用户",
  "wechatuser",
  "wx-user",
  "wxuser"
]);
function sanitizeProvidedNickname(raw: unknown): string {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return "";
  if (WECHAT_PLACEHOLDER_NICKNAMES.has(trimmed.toLowerCase())) return "";
  return trimmed;
}

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
    // 把 "微信用户" 等占位名当作拿不到,避免覆盖掉我们在首次创建时落库的
    // opc_xxxxxxxxxx 动态占位,否则后续每次登录 upsert 都会把昵称改回 "微信用户"。
    const nickname = sanitizeProvidedNickname(profile?.nickName);
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
    // 显式昵称优先(前端 login-card 通过 wx.getUserProfile 授权拿到的,但微信
    // 已废弃该 API,实际总会走到 fallback),拿不到则生成京东式 "opc_xxxxxxxxxx"。
    // 注意:微信授权后常常返回占位名 "微信用户",这里通过 sanitizeProvidedNickname
    // 把它过滤掉,否则所有用户会全都叫 "微信用户"。
    const providedNickname = sanitizeProvidedNickname(base.nickname || base.name);
    const nickname = providedNickname || buildFreshNicknamePlaceholder();

    return this.prisma.user.create({
      data: {
        id: `user-${randomUUID()}`,
        name: nickname,
        nickname,
        initial: String(base.initial || nickname.slice(0, 1) || "探"),
        stage: String(base.stage || DEFAULT_USER_TEMPLATE.stage || "").trim() || null,
        streakDays: Number.isFinite(Number(base.streakDays)) ? Number(base.streakDays) : DEFAULT_USER_TEMPLATE.streakDays,
        subtitle: String(base.subtitle || DEFAULT_USER_TEMPLATE.subtitle || "").trim() || null,
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

  private async createMockUser(base: Record<string, unknown> = {}) {
    const providedNickname = sanitizeProvidedNickname(base.nickname || base.name);
    const nickname = providedNickname || buildFreshNicknamePlaceholder();

    return this.prisma.user.create({
      data: {
        id: `user-${randomUUID()}`,
        name: nickname,
        nickname,
        initial: String(base.initial || nickname.slice(0, 1) || "探"),
        stage: String(base.stage || DEFAULT_USER_TEMPLATE.stage || "").trim() || null,
        streakDays: Number.isFinite(Number(base.streakDays)) ? Number(base.streakDays) : DEFAULT_USER_TEMPLATE.streakDays,
        subtitle: String(base.subtitle || DEFAULT_USER_TEMPLATE.subtitle || "").trim() || null,
        avatarUrl: String(base.avatarUrl || "").trim() || null,
        ...this.buildMockWechatUserPatch()
      }
    });
  }

  async loginByWechat(payload: WechatLoginPayload = {}) {
    const code = String(payload.code || "").trim();
    const encryptedData = String(payload.encryptedData || "").trim();
    const iv = String(payload.iv || "").trim();
    // 前端 login-card 通过 wx.getUserProfile 授权后同步传回的昵称/头像。
    // 过滤 "微信用户" 等废弃 API 返回的占位名,否则会覆盖掉 opc_xxxxxxxxxx 动态占位。
    const providedNickname = sanitizeProvidedNickname(payload.nickname);
    const providedAvatarUrl = String(payload.avatarUrl || "").trim();
    const shouldSimulateFreshUser =
      this.config.allowDevFreshUserLogin && payload.simulateFreshUser === true;

    if ((encryptedData && !iv) || (!encryptedData && iv)) {
      throw new UnauthorizedException("WeChat encryptedData and iv must be provided together");
    }

    if (this.config.allowMockWechatLogin) {
      const user = shouldSimulateFreshUser
        ? await this.createDevFreshUser({
            // 只继承默认 onboarding 元数据,
            // 故意不带 name / nickname / initial,交给 createDevFreshUser 走显式昵称或动态占位。
            stage: DEFAULT_USER_TEMPLATE.stage,
            streakDays: DEFAULT_USER_TEMPLATE.streakDays,
            subtitle: DEFAULT_USER_TEMPLATE.subtitle,
            ...this.buildMockWechatUserPatch(),
            ...(providedNickname ? { nickname: providedNickname } : {}),
            ...(providedAvatarUrl ? { avatarUrl: providedAvatarUrl } : {})
          })
        : await this.createMockUser({
            stage: DEFAULT_USER_TEMPLATE.stage,
            streakDays: DEFAULT_USER_TEMPLATE.streakDays,
            subtitle: DEFAULT_USER_TEMPLATE.subtitle,
            ...(providedNickname ? { nickname: providedNickname } : {}),
            ...(providedAvatarUrl ? { avatarUrl: providedAvatarUrl } : {})
          });
      const tokens = await this.issueTokens(user.id);

      return {
        ...tokens,
        user: this.userService.buildUserPayload(user)
      };
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

      // 昵称解析优先级:前端授权拉到的 > 后端解密 encryptedData 得到的 > 动态占位
      // 对 encryptedData 解密出的昵称也做一次占位过滤,因为微信也会往里塞 "微信用户"。
      const resolvedNickname = providedNickname || sanitizeProvidedNickname(profile?.nickName);
      const resolvedAvatarUrl = providedAvatarUrl || String(profile?.avatarUrl || "").trim();

      if (shouldSimulateFreshUser) {
        const freshUser = await this.createDevFreshUser({
          ...this.buildWechatUserPatch(session, profile),
          ...(resolvedNickname ? { nickname: resolvedNickname } : {}),
          ...(resolvedAvatarUrl ? { avatarUrl: resolvedAvatarUrl } : {}),
          stage: DEFAULT_USER_TEMPLATE.stage,
          streakDays: DEFAULT_USER_TEMPLATE.streakDays,
          subtitle: DEFAULT_USER_TEMPLATE.subtitle
        });
        userId = freshUser.id;
      } else {
        const existingIdentity = await this.findWechatIdentity(openId, unionId);
        userId = existingIdentity?.userId || `user-${randomUUID()}`;

        // 新用户:没拿到显式昵称时落动态占位;老用户(existingIdentity 命中):
        // 不覆盖数据库里已有的 name/nickname,update 只走 buildWechatUserPatch。
        const createNickname = resolvedNickname || buildFreshNicknamePlaceholder();

        await this.prisma.user.upsert({
          where: {
            id: userId
          },
          create: {
            id: userId,
            name: createNickname,
            nickname: createNickname,
            initial: createNickname.slice(0, 1),
            stage: DEFAULT_USER_TEMPLATE.stage,
            streakDays: DEFAULT_USER_TEMPLATE.streakDays,
            subtitle: DEFAULT_USER_TEMPLATE.subtitle,
            avatarUrl: resolvedAvatarUrl || null,
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

      const user = await this.userService.requireUser(userId);
      const tokens = await this.issueTokens(userId);

      return {
        ...tokens,
        user: this.userService.buildUserPayload(user)
      };
    }

    if (!this.wechatService.isConfigured()) {
      const user = shouldSimulateFreshUser
        ? await this.createDevFreshUser({
            // 同 allowMockWechatLogin 分支:只继承默认 onboarding 元数据,
            // name/nickname 由前端授权昵称或动态占位决定。
            stage: DEFAULT_USER_TEMPLATE.stage,
            streakDays: DEFAULT_USER_TEMPLATE.streakDays,
            subtitle: DEFAULT_USER_TEMPLATE.subtitle,
            ...this.buildMockWechatUserPatch(),
            ...(providedNickname ? { nickname: providedNickname } : {}),
            ...(providedAvatarUrl ? { avatarUrl: providedAvatarUrl } : {})
          })
        : await this.createMockUser({
            stage: DEFAULT_USER_TEMPLATE.stage,
            streakDays: DEFAULT_USER_TEMPLATE.streakDays,
            subtitle: DEFAULT_USER_TEMPLATE.subtitle,
            ...(providedNickname ? { nickname: providedNickname } : {}),
            ...(providedAvatarUrl ? { avatarUrl: providedAvatarUrl } : {})
          });
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
