import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import axios, { AxiosError } from "axios";
import { getAppConfig } from "./app-config";

export type MsgSecCheckScene = 1 | 2 | 3 | 4;

export type ContentSecurityResult = {
  pass: boolean;
  degraded: boolean;
  label?: number;
  suggest?: string;
  detail?: string;
  traceId?: string;
};

type MsgSecCheckResponse = {
  errcode?: number;
  errmsg?: string;
  trace_id?: string;
  result?: {
    suggest?: string;
    label?: number;
  };
  detail?: Array<{
    strategy?: string;
    errcode?: number;
    suggest?: string;
    label?: number;
    keyword?: string;
  }>;
};

type StableTokenResponse = {
  access_token?: string;
  expires_in?: number;
  errcode?: number;
  errmsg?: string;
};

// msgSecCheck 单次调用支持的最大 UTF-8 字节数（官方限制 2500 字节）。
// 我们按字符长度保守截断到 1000 字，覆盖绝大多数 chat 输入；报告/AI 输出
// 过长时由调用方自行切片或放弃校验。
const MSG_SEC_CHECK_MAX_CHARS = 1000;

// access_token 实际有效期 7200s，提前 10 分钟换新避免命中过期窗口。
const TOKEN_RENEW_BEFORE_MS = 10 * 60 * 1000;

@Injectable()
export class ContentSecurityService {
  private readonly logger = new Logger(ContentSecurityService.name);
  private readonly config = getAppConfig();

  private cachedToken: { accessToken: string; expiresAt: number } | null = null;
  private pendingTokenFetch: Promise<string> | null = null;

  /**
   * 是否启用（要求同时具备 WeChat 凭证 + 非 dev bypass）。
   * 生产环境默认启用；开发环境缺少 WeChat 凭证时自动降级为跳过。
   */
  isEnabled() {
    if (!this.config.contentSecurityEnabled) return false;
    if (!this.config.hasWechatConfig) return false;
    return true;
  }

  /**
   * 校验一段文本是否通过微信内容安全审核。
   *
   * - 服务未启用、文本为空 → pass=true, degraded=true（不拦截）。
   * - 微信网络/鉴权失败 → pass=true, degraded=true 并记录 warn 日志，
   *   避免微信自己抽风时把线上输入链路打死；但 errcode=87014 等明确拒绝仍视为 pass=false。
   *
   * scene: 1=资料 2=评论 3=论坛 4=社交日志。昵称用 1，对话/帖子用 2 或 3。
   */
  async checkText(
    text: string,
    options: {
      openId?: string | null;
      scene: MsgSecCheckScene;
      label?: string; // 日志标签，便于排查来源
    }
  ): Promise<ContentSecurityResult> {
    const content = (text ?? "").toString();
    if (!content.trim()) {
      return { pass: true, degraded: false };
    }

    if (!this.isEnabled()) {
      return { pass: true, degraded: true, detail: "disabled" };
    }

    const openId = String(options.openId || "").trim();
    if (!openId) {
      // 没有 openId 的用户（dev fallback、未绑定微信）跳过审核，但留痕
      this.logger.debug(`content-security skip: missing openId (label=${options.label || "n/a"})`);
      return { pass: true, degraded: true, detail: "missing_openid" };
    }

    // 超长截断（msgSecCheck 有字节上限；这里按字符粗略切）
    const trimmed = content.length > MSG_SEC_CHECK_MAX_CHARS ? content.slice(0, MSG_SEC_CHECK_MAX_CHARS) : content;

    let accessToken: string;
    try {
      accessToken = await this.getAccessToken();
    } catch (error) {
      this.logger.warn(
        `content-security degraded: failed to fetch access_token (${resolveErrorMessage(error)}) label=${options.label || "n/a"}`
      );
      return { pass: true, degraded: true, detail: "token_failed" };
    }

    let response;
    try {
      response = await axios.post<MsgSecCheckResponse>(
        "https://api.weixin.qq.com/wxa/msg_sec_check",
        {
          version: 2,
          scene: options.scene,
          openid: openId,
          content: trimmed
        },
        {
          params: { access_token: accessToken },
          timeout: 5000
        }
      );
    } catch (error) {
      const axiosError = error as AxiosError;
      this.logger.warn(
        `content-security degraded: msgSecCheck request failed (${resolveErrorMessage(axiosError)}) label=${options.label || "n/a"}`
      );
      return { pass: true, degraded: true, detail: "request_failed" };
    }

    const data = response.data || {};
    const errcode = typeof data.errcode === "number" ? data.errcode : 0;
    const traceId = String(data.trace_id || "");
    const resultSuggest = String(data.result?.suggest || "").trim();
    const resultLabel = typeof data.result?.label === "number" ? data.result.label : undefined;

    if (errcode === 0 && resultSuggest) {
      // errcode=0 代表接口调用成功，result.suggest 才是审核结论
      // suggest: pass / review / risky
      if (resultSuggest === "pass") {
        return { pass: true, degraded: false, label: resultLabel, suggest: "pass", traceId };
      }

      // review/risky 都视作不通过，拒绝写入
      return {
        pass: false,
        degraded: false,
        label: resultLabel,
        suggest: resultLabel !== undefined ? String(resultLabel) : resultSuggest,
        detail: resultSuggest,
        traceId
      };
    }

    // errcode 非 0：
    //   87014 = 内容命中过滤词（老版本错误码，也视为不通过）
    //   40001/42001 = access_token 无效/过期（换新后重试，这里只降级一次）
    //   其它 = 视为降级，不拦截
    if (errcode === 87014) {
      return {
        pass: false,
        degraded: false,
        suggest: "risky",
        detail: data.errmsg || "content_risky",
        traceId
      };
    }

    if (errcode === 40001 || errcode === 42001) {
      this.invalidateToken();
    }

    this.logger.warn(
      `content-security degraded: errcode=${errcode} errmsg=${data.errmsg || ""} label=${options.label || "n/a"}`
    );
    return { pass: true, degraded: true, detail: `errcode_${errcode}`, traceId };
  }

  /**
   * 当上层检测到不通过时，用它构造统一的 400 响应，前端可复用 errmsg 提示用户。
   */
  buildRejectionException(result: ContentSecurityResult, label: string) {
    const suggest = result.suggest || "risky";
    const message =
      suggest === "review"
        ? `该内容疑似违规，需人工确认后再发送（${label}）。`
        : `该内容未通过平台安全审核，请调整后再试（${label}）。`;
    return new BadRequestException({
      code: "CONTENT_SECURITY_REJECTED",
      message,
      suggest,
      label,
      traceId: result.traceId || ""
    });
  }

  private invalidateToken() {
    this.cachedToken = null;
    this.pendingTokenFetch = null;
  }

  private async getAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.cachedToken && now < this.cachedToken.expiresAt - TOKEN_RENEW_BEFORE_MS) {
      return this.cachedToken.accessToken;
    }

    if (this.pendingTokenFetch) {
      return this.pendingTokenFetch;
    }

    this.pendingTokenFetch = this.fetchStableToken()
      .then((token) => {
        this.pendingTokenFetch = null;
        return token;
      })
      .catch((error) => {
        this.pendingTokenFetch = null;
        throw error;
      });

    return this.pendingTokenFetch;
  }

  private async fetchStableToken(): Promise<string> {
    // 使用 stable_token 端点：同一秒重复调用直接返回同一 token，避免多实例抢新 token
    // 把正在使用的旧 token 挤掉（老的 /cgi-bin/token 会失效老 token）。
    const response = await axios.post<StableTokenResponse>(
      "https://api.weixin.qq.com/cgi-bin/stable_token",
      {
        grant_type: "client_credential",
        appid: this.config.wechatAppId,
        secret: this.config.wechatAppSecret,
        force_refresh: false
      },
      {
        timeout: 5000
      }
    );

    const data = response.data || {};
    const accessToken = String(data.access_token || "").trim();
    const expiresIn = typeof data.expires_in === "number" && data.expires_in > 0 ? data.expires_in : 7200;

    if (!accessToken) {
      throw new Error(`stable_token empty: errcode=${data.errcode} errmsg=${data.errmsg}`);
    }

    this.cachedToken = {
      accessToken,
      expiresAt: Date.now() + expiresIn * 1000
    };

    return accessToken;
  }
}

function resolveErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error || "unknown_error");
}
