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

type DevFreshLoginPayload = {
  nickname?: string;
  avatarUrl?: string;
  devLoginSecret?: string;
};

// 褰撳墠绔病鑳介€氳繃 wx.getUserProfile 鎷垮埌鐪熷疄寰俊鏄电О鏃?wx.getUserProfile 鑷?
// 2022-10 宸茶寰俊搴熷純,鎵€鏈夋柊鐢ㄦ埛瀹為檯涓婇兘浼氳蛋鍒拌繖閲?,鐢熸垚涓€涓含涓滃紡鐨勪笉閫忔槑
// 鍙 ID 浣滀负灞曠ず鏄电О,涓嶅啀 fallback 鍒伴潤鎬佺ず渚嬫樀绉?閬垮厤鏂?
// 鐢ㄦ埛鍜?demo 璐﹀彿鍚屽悕瀵艰嚧鐨勪吉鐧诲綍閿欒銆傛牸寮?opc_a1b2c3d4e5(10 浣嶅皬鍐?hex)
function buildFreshNicknamePlaceholder() {
  const suffix = randomUUID().replace(/-/g, "").slice(0, 10).toLowerCase();
  return `opc_${suffix}`;
}

// 寰俊 2022-10 涔嬪悗搴熷純浜?wx.getUserProfile,浣嗘巿鏉冧粛浼氳繑鍥炰竴涓崰浣嶅悕绉?
// "寰俊鐢ㄦ埛" (鏌愪簺鏃х増鏈篃浼氳繑鍥?"WeChatUser" / "wx-user")銆傝繖浜涘苟涓嶆槸鐢ㄦ埛
// 鐪熷疄鏄电О,濡傛灉鍘熸牱钀藉簱鐢ㄦ埛浼氱湅鍒颁竴缇ゅ悓鍚嶈处鍙枫€傛妸杩欎簺鍗犱綅鍊煎綋浣?鎷夸笉鍒版樀绉?
// 澶勭悊,璁╀笂灞傞€昏緫璧?buildFreshNicknamePlaceholder() 鐨?opc_ 鍔ㄦ€佸崰浣嶅垎鏀€?
const WECHAT_PLACEHOLDER_NICKNAMES = new Set([
  "寰俊鐢ㄦ埛",
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
    // 鎶?"寰俊鐢ㄦ埛" 绛夊崰浣嶅悕褰撲綔鎷夸笉鍒?閬垮厤瑕嗙洊鎺夋垜浠湪棣栨鍒涘缓鏃惰惤搴撶殑
    // opc_xxxxxxxxxx 鍔ㄦ€佸崰浣?鍚﹀垯鍚庣画姣忔鐧诲綍 upsert 閮戒細鎶婃樀绉版敼鍥?"寰俊鐢ㄦ埛"銆?
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
    // 鏄惧紡鏄电О浼樺厛(鍓嶇 login-card 閫氳繃 wx.getUserProfile 鎺堟潈鎷垮埌鐨?浣嗗井淇?
    // 宸插簾寮冭 API,瀹為檯鎬讳細璧板埌 fallback),鎷夸笉鍒板垯鐢熸垚浜笢寮?"opc_xxxxxxxxxx"銆?
    // 娉ㄦ剰:寰俊鎺堟潈鍚庡父甯歌繑鍥炲崰浣嶅悕 "寰俊鐢ㄦ埛",杩欓噷閫氳繃 sanitizeProvidedNickname
    // 鎶婂畠杩囨护鎺?鍚﹀垯鎵€鏈夌敤鎴蜂細鍏ㄩ兘鍙?"寰俊鐢ㄦ埛"銆?
    const providedNickname = sanitizeProvidedNickname(base.nickname || base.name);
    const nickname = providedNickname || buildFreshNicknamePlaceholder();

    return this.prisma.user.create({
      data: {
        id: `user-${randomUUID()}`,
        name: nickname,
        nickname,
        initial: String(base.initial || nickname.slice(0, 1) || "O"),
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
        initial: String(base.initial || nickname.slice(0, 1) || "O"),
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

    if (!code) {
      throw new UnauthorizedException("WeChat login requires a valid code");
    }

    if (!this.wechatService.isConfigured()) {
      throw new UnauthorizedException("WECHAT_APP_ID or WECHAT_APP_SECRET is missing");
    }

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
    const resolvedNickname = providedNickname || sanitizeProvidedNickname(profile?.nickName);
    const resolvedAvatarUrl = providedAvatarUrl || String(profile?.avatarUrl || "").trim();

    let userId = "";
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

  async loginByDevFresh(payload: DevFreshLoginPayload = {}) {
    if (!this.config.allowDevFreshUserLogin) {
      throw new UnauthorizedException("Dev fresh login is disabled");
    }

    const expectedSecret = String(this.config.devFreshLoginSecret || "").trim();
    const providedSecret = String(payload.devLoginSecret || "").trim();
    if (!providedSecret || providedSecret !== expectedSecret) {
      throw new UnauthorizedException("Invalid dev fresh login secret");
    }

    const providedNickname = sanitizeProvidedNickname(payload.nickname);
    const providedAvatarUrl = String(payload.avatarUrl || "").trim();

    const user = await this.createDevFreshUser({
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
