import { BadGatewayException, Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import axios from "axios";
import { createDecipheriv } from "node:crypto";
import { getAppConfig } from "../shared/app-config";

export type Code2SessionResponse = {
  openid?: string;
  unionid?: string;
  session_key?: string;
  errcode?: number;
  errmsg?: string;
};

export type WechatAccessTokenResponse = {
  access_token?: string;
  expires_in?: number;
  errcode?: number;
  errmsg?: string;
};

export type WechatSubscribeMessageResponse = {
  errcode?: number;
  errmsg?: string;
};

export type WechatPhoneNumberResponse = {
  errcode?: number;
  errmsg?: string;
  phone_info?: {
    phoneNumber?: string;
    purePhoneNumber?: string;
    countryCode?: string;
    watermark?: {
      appid?: string;
      timestamp?: number;
    };
  };
};

export type WechatMiniProgramPhoneNumber = {
  phoneNumber: string;
  purePhoneNumber: string;
  countryCode: string;
};

export type WechatSubscribeMessagePayload = {
  openId: string;
  templateId: string;
  page?: string;
  data: Record<string, { value: string }>;
};

export type WechatMiniProgramUserProfile = {
  openId?: string;
  unionId?: string;
  nickName?: string;
  avatarUrl?: string;
  gender?: number;
  country?: string;
  province?: string;
  city?: string;
  language?: string;
  watermark?: {
    appid?: string;
    timestamp?: number;
  };
};

@Injectable()
export class WechatService {
  private readonly logger = new Logger(WechatService.name);
  private readonly config = getAppConfig();
  private accessTokenCache: { token: string; expiresAt: number } | null = null;

  isConfigured() {
    return Boolean(this.config.wechatAppId && this.config.wechatAppSecret);
  }

  async code2Session(code: string): Promise<Code2SessionResponse> {
    const normalizedCode = String(code || "").trim();

    if (!normalizedCode) {
      throw new UnauthorizedException("WeChat login code is required");
    }

    if (!this.isConfigured()) {
      throw new UnauthorizedException("WECHAT_APP_ID or WECHAT_APP_SECRET is missing");
    }

    let response: { data: Code2SessionResponse };

    try {
      response = await axios.get<Code2SessionResponse>("https://api.weixin.qq.com/sns/jscode2session", {
        params: {
          appid: this.config.wechatAppId,
          secret: this.config.wechatAppSecret,
          js_code: normalizedCode,
          grant_type: "authorization_code"
        },
        timeout: 8000
      });
    } catch (error) {
      const message = axios.isAxiosError(error)
        ? this.normalizeWechatApiMessage(this.resolveWechatErrorMessage(error.response?.data) || error.message)
        : "Unknown error";
      this.logger.warn(`WeChat code2Session request failed: ${message}`);
      throw new BadGatewayException("Failed to exchange WeChat login code");
    }

    const data = response.data || {};

    if (data.errcode) {
      const normalizedMessage = this.normalizeWechatApiMessage(data.errmsg || `WeChat code2Session failed: ${data.errcode}`);
      this.logger.warn(`WeChat code2Session rejected: ${normalizedMessage}`);
      throw new UnauthorizedException(normalizedMessage);
    }

    if (!data.openid || !data.session_key) {
      throw new UnauthorizedException("WeChat code2Session response is missing openid or session_key");
    }

    return data;
  }

  async sendSubscribeMessage(payload: WechatSubscribeMessagePayload): Promise<WechatSubscribeMessageResponse> {
    const openId = String(payload.openId || "").trim();
    const templateId = String(payload.templateId || "").trim();

    if (!openId || !templateId) {
      return {
        errcode: -1,
        errmsg: "missing openid or template id"
      };
    }

    if (!this.isConfigured()) {
      return {
        errcode: -2,
        errmsg: "wechat is not configured"
      };
    }

    const result = await this.sendSubscribeMessageWithToken(payload, false);
    if (result.errcode && [40001, 40014, 42001].includes(result.errcode)) {
      this.accessTokenCache = null;
      return this.sendSubscribeMessageWithToken(payload, true);
    }

    return result;
  }

  async getPhoneNumber(code: string): Promise<WechatMiniProgramPhoneNumber> {
    const normalizedCode = String(code || "").trim();

    if (!normalizedCode) {
      throw new UnauthorizedException("WeChat phone code is required");
    }

    if (!this.isConfigured()) {
      throw new UnauthorizedException("WECHAT_APP_ID or WECHAT_APP_SECRET is missing");
    }

    let accessToken = await this.getAccessToken(false);
    if (!accessToken) {
      throw new BadGatewayException("Failed to resolve WeChat access token");
    }

    let data = await this.requestPhoneNumberWithToken(normalizedCode, accessToken);
    if (data.errcode && [40001, 40014, 42001].includes(data.errcode)) {
      this.accessTokenCache = null;
      accessToken = await this.getAccessToken(true);
      if (!accessToken) {
        throw new BadGatewayException("Failed to resolve WeChat access token");
      }
      data = await this.requestPhoneNumberWithToken(normalizedCode, accessToken);
    }

    if (data.errcode) {
      const normalizedMessage = this.normalizeWechatApiMessage(data.errmsg || `WeChat getPhoneNumber failed: ${data.errcode}`);
      this.logger.warn(`WeChat getPhoneNumber rejected: ${normalizedMessage}`);
      throw new UnauthorizedException(normalizedMessage);
    }

    const phoneInfo = data.phone_info || {};
    const purePhoneNumber = String(phoneInfo.purePhoneNumber || phoneInfo.phoneNumber || "").trim();
    const phoneNumber = String(phoneInfo.phoneNumber || purePhoneNumber).trim();
    const countryCode = String(phoneInfo.countryCode || "86").trim();

    if (phoneInfo.watermark?.appid && phoneInfo.watermark.appid !== this.config.wechatAppId) {
      throw new UnauthorizedException("WeChat phone appId mismatch");
    }

    if (!purePhoneNumber) {
      throw new UnauthorizedException("WeChat phone response is missing phone number");
    }

    return {
      phoneNumber,
      purePhoneNumber,
      countryCode
    };
  }

  decryptMiniProgramUserProfile(payload: {
    encryptedData: string;
    iv: string;
    sessionKey: string;
  }): WechatMiniProgramUserProfile {
    const encryptedData = String(payload.encryptedData || "").trim();
    const iv = String(payload.iv || "").trim();
    const sessionKey = String(payload.sessionKey || "").trim();

    if (!encryptedData || !iv || !sessionKey) {
      throw new UnauthorizedException("WeChat encryptedData, iv and sessionKey are required");
    }

    try {
      const sessionKeyBuffer = Buffer.from(sessionKey, "base64");
      const ivBuffer = Buffer.from(iv, "base64");

      if (sessionKeyBuffer.length !== 16 || ivBuffer.length !== 16) {
        throw new Error("Invalid session key or iv length");
      }

      const decipher = createDecipheriv("aes-128-cbc", sessionKeyBuffer, ivBuffer);
      decipher.setAutoPadding(true);

      let decoded = decipher.update(encryptedData, "base64", "utf8");
      decoded += decipher.final("utf8");

      const profile = JSON.parse(decoded) as WechatMiniProgramUserProfile;

      if (profile.watermark?.appid && profile.watermark.appid !== this.config.wechatAppId) {
        throw new UnauthorizedException("WeChat user profile appId mismatch");
      }

      return profile;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      this.logger.warn("Failed to decrypt WeChat mini program user profile");
      throw new UnauthorizedException("Failed to decrypt WeChat user profile");
    }
  }

  private resolveWechatErrorMessage(data: unknown) {
    if (!data || typeof data !== "object") {
      return "";
    }

    const candidate = data as { errmsg?: unknown; errcode?: unknown };
    const errMsg = String(candidate.errmsg || "").trim();
    if (errMsg) {
      return errMsg;
    }

    if (typeof candidate.errcode === "number") {
      return `WeChat error code ${candidate.errcode}`;
    }

    return "";
  }

  private async requestPhoneNumberWithToken(code: string, accessToken: string): Promise<WechatPhoneNumberResponse> {
    try {
      const response = await axios.post<WechatPhoneNumberResponse>(
        "https://api.weixin.qq.com/wxa/business/getuserphonenumber",
        {
          code
        },
        {
          params: {
            access_token: accessToken
          },
          timeout: 8000
        }
      );

      return response.data || {};
    } catch (error) {
      const message = axios.isAxiosError(error)
        ? this.normalizeWechatApiMessage(this.resolveWechatErrorMessage(error.response?.data) || error.message)
        : "Unknown error";
      this.logger.warn(`WeChat getPhoneNumber request failed: ${message}`);
      throw new BadGatewayException("Failed to exchange WeChat phone code");
    }
  }

  private async sendSubscribeMessageWithToken(
    payload: WechatSubscribeMessagePayload,
    forceRefreshToken: boolean
  ): Promise<WechatSubscribeMessageResponse> {
    const accessToken = await this.getAccessToken(forceRefreshToken);
    if (!accessToken) {
      return {
        errcode: -3,
        errmsg: "failed to resolve access token"
      };
    }

    try {
      const response = await axios.post<WechatSubscribeMessageResponse>(
        "https://api.weixin.qq.com/cgi-bin/message/subscribe/send",
        {
          touser: payload.openId,
          template_id: payload.templateId,
          page: payload.page || undefined,
          data: payload.data
        },
        {
          params: {
            access_token: accessToken
          },
          timeout: 8000
        }
      );

      return response.data || {};
    } catch (error) {
      const message = axios.isAxiosError(error)
        ? this.normalizeWechatApiMessage(this.resolveWechatErrorMessage(error.response?.data) || error.message)
        : "Unknown error";
      this.logger.warn(`WeChat subscribe message request failed: ${message}`);
      return {
        errcode: -4,
        errmsg: message || "request failed"
      };
    }
  }

  private async getAccessToken(forceRefresh = false) {
    const now = Date.now();
    if (!forceRefresh && this.accessTokenCache && this.accessTokenCache.expiresAt > now + 60_000) {
      return this.accessTokenCache.token;
    }

    if (!this.isConfigured()) {
      return "";
    }

    try {
      const response = await axios.get<WechatAccessTokenResponse>(
        "https://api.weixin.qq.com/cgi-bin/token",
        {
          params: {
            grant_type: "client_credential",
            appid: this.config.wechatAppId,
            secret: this.config.wechatAppSecret
          },
          timeout: 8000
        }
      );
      const data = response.data || {};

      if (data.errcode || !data.access_token) {
        const message = this.normalizeWechatApiMessage(data.errmsg || `WeChat access_token failed: ${data.errcode}`);
        this.logger.warn(`WeChat access_token rejected: ${message}`);
        return "";
      }

      const expiresInMs = Math.max(60, Number(data.expires_in || 7200) - 300) * 1000;
      this.accessTokenCache = {
        token: data.access_token,
        expiresAt: now + expiresInMs
      };

      return data.access_token;
    } catch (error) {
      const message = axios.isAxiosError(error)
        ? this.normalizeWechatApiMessage(this.resolveWechatErrorMessage(error.response?.data) || error.message)
        : "Unknown error";
      this.logger.warn(`WeChat access_token request failed: ${message}`);
      return "";
    }
  }

  private normalizeWechatApiMessage(message: string) {
    const source = String(message || "").trim();
    if (!source) {
      return "";
    }

    const normalized = source.replace(/,\s*rid:\s*.+$/i, "").trim();
    if (/invalid appsecret/i.test(normalized)) {
      return "invalid appsecret";
    }

    if (/invalid code/i.test(normalized)) {
      return "invalid code";
    }

    if (/code been used/i.test(normalized)) {
      return "code been used";
    }

    if (/code expired/i.test(normalized)) {
      return "code expired";
    }

    return normalized;
  }
}
