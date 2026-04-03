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
      throw new UnauthorizedException(this.normalizeWechatApiMessage(data.errmsg || `WeChat code2Session failed: ${data.errcode}`));
    }

    if (!data.openid || !data.session_key) {
      throw new UnauthorizedException("WeChat code2Session response is missing openid or session_key");
    }

    return data;
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
