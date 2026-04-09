import { Injectable } from "@nestjs/common";
import axios, { AxiosError } from "axios";
import { getAppConfig } from "./shared/app-config";

type DifyChatRequest = {
  query: string;
  user: string;
  conversationId?: string;
};

type DifyRequestOptions = {
  apiKey?: string;
};

type DifyChatResponse = {
  conversationId: string;
  answer: string;
  messageId: string;
  raw: Record<string, unknown>;
};

@Injectable()
export class DifyService {
  private readonly config = getAppConfig();
  private readonly disabledUntilByCredential = new Map<string, number>();

  private sanitizeAnswer(answer: unknown) {
    const cleaned = String(answer || "")
      .replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, "")
      .trim();

    return collapseRepeatedAnswer(cleaned);
  }

  private resolveApiKey(apiKey?: string) {
    return String(apiKey || this.config.difyApiKey || "").trim();
  }

  private getCircuitKey(apiKey: string) {
    return apiKey || "__default__";
  }

  private getDisabledUntil(apiKey: string) {
    return this.disabledUntilByCredential.get(this.getCircuitKey(apiKey)) || 0;
  }

  private setDisabledUntil(apiKey: string, disabledUntil: number) {
    this.disabledUntilByCredential.set(this.getCircuitKey(apiKey), disabledUntil);
  }

  isEnabled(apiKey?: string) {
    const credential = this.resolveApiKey(apiKey);
    return this.config.difyEnabled && !!credential && Date.now() >= this.getDisabledUntil(credential);
  }

  private buildUrl(pathname: string) {
    return `${this.config.difyApiBaseUrl.replace(/\/+$/, "")}/${pathname.replace(/^\/+/, "")}`;
  }

  private buildHeaders(apiKey: string) {
    return {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    };
  }

  private normalizeError(error: unknown, apiKey: string) {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError<{ message?: string; code?: string }>;
      const remoteMessage =
        axiosError.response?.data?.message ||
        axiosError.response?.statusText ||
        axiosError.message;
      const status = axiosError.response?.status;

      if (status === 401) {
        this.setDisabledUntil(apiKey, Date.now() + 5 * 60 * 1000);
      } else if (!status || status === 429 || status >= 500) {
        this.setDisabledUntil(apiKey, Date.now() + 60 * 1000);
      }

      return new Error(`Dify request failed: ${this.simplifyRemoteMessage(remoteMessage)}`);
    }

    this.setDisabledUntil(apiKey, Date.now() + 60 * 1000);

    if (error instanceof Error) {
      return new Error(`Dify request failed: ${this.simplifyRemoteMessage(error.message)}`);
    }

    return new Error("Dify request failed");
  }

  private simplifyRemoteMessage(message: unknown) {
    const source = String(message || "").trim();
    if (!source) {
      return "unknown_error";
    }

    const timeoutMatch = source.match(/timeout of (\d+)ms exceeded/i);
    if (timeoutMatch) {
      return `timeout of ${timeoutMatch[1]}ms exceeded`;
    }

    if (source.includes("messages 参数非法")) {
      return "Dify 模型配置不兼容 chat 消息格式（messages 参数非法）";
    }

    if (source.includes("invalid appsecret")) {
      return "invalid appsecret";
    }

    if (source.includes("invalid code")) {
      return "invalid code";
    }

    return source;
  }

  async sendChatMessage(payload: DifyChatRequest, options: DifyRequestOptions = {}): Promise<DifyChatResponse> {
    const apiKey = this.resolveApiKey(options.apiKey);

    if (!this.isEnabled(apiKey)) {
      throw new Error("Dify is not enabled");
    }

    const response = await axios
      .post(
        this.buildUrl("/chat-messages"),
        {
          inputs: {},
          query: payload.query,
          response_mode: "blocking",
          conversation_id: payload.conversationId || "",
          user: payload.user
        },
        {
          headers: this.buildHeaders(apiKey),
          timeout: this.config.difyRequestTimeoutMs
        }
      )
      .catch((error) => {
        throw this.normalizeError(error, apiKey);
      });

    const data = response.data && typeof response.data === "object" ? response.data as Record<string, unknown> : {};

    return {
      conversationId: String(data.conversation_id || ""),
      answer: this.sanitizeAnswer(data.answer),
      messageId: String(data.message_id || ""),
      raw: data
    };
  }
}

function collapseRepeatedAnswer(answer: string) {
  const text = String(answer || "").trim();
  if (text.length < 80) {
    return text;
  }

  const middle = Math.floor(text.length / 2);
  for (let offset = -10; offset <= 10; offset += 1) {
    const splitIndex = middle + offset;
    if (splitIndex <= 0 || splitIndex >= text.length) {
      continue;
    }

    const first = text.slice(0, splitIndex).trim();
    const second = text.slice(splitIndex).trim();
    if (!first || !second) {
      continue;
    }

    if (normalizeForComparison(first) === normalizeForComparison(second)) {
      return first;
    }
  }

  return text;
}

function normalizeForComparison(text: string) {
  return text.replace(/\s+/g, " ").trim();
}
