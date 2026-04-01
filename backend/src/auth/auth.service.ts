import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { randomUUID } from "node:crypto";
import { getAppConfig } from "../shared/app-config";
import { InMemoryDataService } from "../shared/in-memory-data.service";
import { Code2SessionResponse, WechatMiniProgramUserProfile, WechatService } from "./wechat.service";

type RefreshSession = {
  sessionId: string;
  userId: string;
};

type WechatIdentity = {
  userId: string;
  openId?: string;
  unionId?: string;
  sessionKey?: string;
};

type WechatLoginPayload = {
  code?: string;
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
  private readonly refreshSessions = new Map<string, RefreshSession>();
  private readonly activeSessions = new Map<string, { userId: string }>();
  private readonly identities = new Map<string, WechatIdentity>();
  private readonly accessTokenExpiresIn = parseDurationToSeconds(this.config.accessTokenTtl, 7200);

  constructor(
    private readonly jwtService: JwtService,
    private readonly store: InMemoryDataService,
    private readonly wechatService: WechatService
  ) {}

  private issueTokens(userId: string) {
    const sessionId = randomUUID();
    this.activeSessions.set(sessionId, {
      userId
    });

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

    this.refreshSessions.set(refreshToken, {
      sessionId,
      userId
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: this.accessTokenExpiresIn
    };
  }

  private getWechatIdentityKeys(openId?: string, unionId?: string) {
    return [
      unionId ? `wechat_unionid:${unionId}` : "",
      openId ? `wechat_openid:${openId}` : ""
    ].filter(Boolean);
  }

  private findWechatIdentity(openId?: string, unionId?: string) {
    for (const key of this.getWechatIdentityKeys(openId, unionId)) {
      const identity = this.identities.get(key);
      if (identity) {
        return identity;
      }
    }

    return null;
  }

  private saveWechatIdentity(identity: WechatIdentity) {
    for (const key of this.getWechatIdentityKeys(identity.openId, identity.unionId)) {
      this.identities.set(key, identity);
    }
  }

  private buildWechatUserPatch(
    session: Code2SessionResponse,
    profile: WechatMiniProgramUserProfile | null
  ): Record<string, unknown> {
    const patch: Record<string, unknown> = {
      loggedIn: true,
      loginMode: "wechat-miniprogram",
      lastLoginAt: new Date().toISOString()
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
      lastLoginAt: new Date().toISOString()
    };
  }

  private revokeSessionById(sessionId?: string) {
    if (!sessionId) {
      return;
    }

    this.activeSessions.delete(sessionId);

    for (const [storedToken, session] of this.refreshSessions.entries()) {
      if (session.sessionId === sessionId) {
        this.refreshSessions.delete(storedToken);
      }
    }
  }

  async loginByWechat(payload: WechatLoginPayload = {}) {
    const code = String(payload.code || "").trim();
    const encryptedData = String(payload.encryptedData || "").trim();
    const iv = String(payload.iv || "").trim();

    if ((encryptedData && !iv) || (!encryptedData && iv)) {
      throw new UnauthorizedException("WeChat encryptedData and iv must be provided together");
    }

    if (code) {
      if (!this.wechatService.isConfigured()) {
        throw new UnauthorizedException("WeChat login is not configured. Please set WECHAT_APP_ID and WECHAT_APP_SECRET");
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
      const existingIdentity = this.findWechatIdentity(
        String(profile?.openId || session.openid || "").trim(),
        String(profile?.unionId || session.unionid || "").trim()
      );
      const currentUser = this.store.getUser();
      const userId = existingIdentity?.userId || String(currentUser.id);

      this.saveWechatIdentity({
        userId,
        openId: String(profile?.openId || session.openid || "").trim() || undefined,
        unionId: String(profile?.unionId || session.unionid || "").trim() || undefined,
        sessionKey: session.session_key
      });

      const nextUser = this.store.updateUser(this.buildWechatUserPatch(session, profile));
      return {
        ...this.issueTokens(userId),
        user: nextUser
      };
    }

    if (this.config.allowMockWechatLogin) {
      const nextUser = this.store.updateUser(this.buildMockWechatUserPatch());
      return {
        ...this.issueTokens(String(nextUser.id)),
        user: nextUser
      };
    }

    throw new UnauthorizedException("WeChat login requires a valid code and configured credentials");
  }

  refreshAccessToken(refreshToken?: string) {
    const token = String(refreshToken || "").trim();

    if (!token || !this.refreshSessions.has(token)) {
      throw new UnauthorizedException("Invalid refresh token");
    }

    let payload: { sub: string; sid: string; typ: string };

    try {
      payload = this.jwtService.verify<{ sub: string; sid: string; typ: string }>(token, {
        secret: this.config.jwtSecret
      });
    } catch (error) {
      this.refreshSessions.delete(token);
      throw new UnauthorizedException("Invalid refresh token");
    }

    if (payload.typ !== "refresh") {
      throw new UnauthorizedException("Invalid refresh token type");
    }

    const session = this.refreshSessions.get(token);

    if (!session || session.sessionId !== payload.sid || session.userId !== payload.sub) {
      this.refreshSessions.delete(token);
      throw new UnauthorizedException("Invalid refresh token");
    }

    this.revokeSessionById(payload.sid);

    return this.issueTokens(payload.sub);
  }

  resolveUserFromAuthorization(authorization?: string) {
    const token = String(authorization || "").replace(/^Bearer\s+/i, "").trim();
    if (!token) {
      return null;
    }

    try {
      const payload = this.jwtService.verify<{ sub: string; sid: string; typ: string }>(token, {
        secret: this.config.jwtSecret
      });

      if (payload.typ !== "access") {
        return null;
      }

      const session = this.activeSessions.get(payload.sid);
      if (!session || session.userId !== payload.sub) {
        return null;
      }

      const user = this.store.getUser();
      return String(user.id) === payload.sub ? user : null;
    } catch (error) {
      return null;
    }
  }

  getAuthUser(authorization?: string) {
    const user = this.resolveUserFromAuthorization(authorization);

    if (!user) {
      throw new UnauthorizedException("Unauthorized");
    }

    return user;
  }

  logout(refreshToken?: string, authorization?: string) {
    const token = String(refreshToken || "").trim();
    if (token) {
      try {
        const payload = this.jwtService.verify<{ sid: string; typ: string }>(token, {
          secret: this.config.jwtSecret
        });

        if (payload.typ === "refresh") {
          this.revokeSessionById(payload.sid);
        }
      } catch (error) {
        this.refreshSessions.delete(token);
      }
    }

    const accessToken = String(authorization || "").replace(/^Bearer\s+/i, "").trim();
    if (accessToken) {
      try {
        const payload = this.jwtService.verify<{ sid: string }>(accessToken, {
          secret: this.config.jwtSecret
        });

        this.revokeSessionById(payload.sid);
      } catch (error) {
        // noop
      }
    }

    this.store.updateUser({
      loggedIn: false,
      loginMode: null,
      lastLogoutAt: new Date().toISOString()
    });

    return {
      success: true
    };
  }
}
