import { Injectable } from "@nestjs/common";
import axios, { AxiosError } from "axios";
import { getAppConfig } from "./shared/app-config";

type DifyChatRequest = {
  query: string;
  user: string;
  conversationId?: string;
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
  private disabledUntil = 0;

  private sanitizeAnswer(answer: unknown) {
    return String(answer || "")
      .replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, "")
      .trim();
  }

  isEnabled() {
    return this.config.difyEnabled && !!this.config.difyApiKey && Date.now() >= this.disabledUntil;
  }

  private buildUrl(pathname: string) {
    return `${this.config.difyApiBaseUrl.replace(/\/+$/, "")}/${pathname.replace(/^\/+/, "")}`;
  }

  private buildHeaders() {
    return {
      Authorization: `Bearer ${this.config.difyApiKey}`,
      "Content-Type": "application/json"
    };
  }

  private normalizeError(error: unknown) {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError<{ message?: string; code?: string }>;
      const remoteMessage =
        axiosError.response?.data?.message ||
        axiosError.response?.statusText ||
        axiosError.message;
      const status = axiosError.response?.status;

      if (status === 401) {
        this.disabledUntil = Date.now() + 5 * 60 * 1000;
      } else if (!status || status === 429 || status >= 500) {
        this.disabledUntil = Date.now() + 60 * 1000;
      }

      return new Error(`Dify request failed: ${remoteMessage}`);
    }

    this.disabledUntil = Date.now() + 60 * 1000;

    return error instanceof Error ? error : new Error("Dify request failed");
  }

  async sendChatMessage(payload: DifyChatRequest): Promise<DifyChatResponse> {
    if (!this.isEnabled()) {
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
          headers: this.buildHeaders(),
          timeout: this.config.difyRequestTimeoutMs
        }
      )
      .catch((error) => {
        throw this.normalizeError(error);
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
