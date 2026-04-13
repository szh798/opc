import { Injectable, Logger } from "@nestjs/common";
import axios, { AxiosError } from "axios";
import { getAppConfig } from "../shared/app-config";

/**
 * 智谱 BigModel 的 OpenAI 兼容客户端（轻量 axios 封装）。
 *
 * 之所以不引入 `openai` SDK：后端只需要一个 `chat.completions.create` 等价调用，
 * 加 SDK 会膨胀依赖和冷启动。axios 已经是现成依赖。
 *
 * 端点文档：https://open.bigmodel.cn/dev/api#sdk_install
 * OpenAI 兼容路径：POST {baseURL}/chat/completions
 */

export type ZhipuChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ZhipuChatOptions = {
  model: string;
  messages: ZhipuChatMessage[];
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  /**
   * GLM 支持 OpenAI 风格的 JSON mode：
   *   response_format: { type: "json_object" }
   * 注意：只保证返回合法 JSON 对象（顶层必须是 {}，不能是数组）。
   */
  responseFormat?: "text" | "json_object";
};

export type ZhipuChatResult = {
  content: string;
  finishReason: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
};

@Injectable()
export class ZhipuClientService {
  private readonly logger = new Logger(ZhipuClientService.name);
  private readonly config = getAppConfig();

  isConfigured(): boolean {
    return !!this.config.zhipuApiKey;
  }

  async chatCompletion(options: ZhipuChatOptions): Promise<ZhipuChatResult> {
    if (!this.isConfigured()) {
      throw new Error("ZHIPU_API_KEY is not configured");
    }

    const url = `${this.config.zhipuBaseUrl.replace(/\/+$/, "")}/chat/completions`;
    const body: Record<string, unknown> = {
      model: options.model,
      messages: options.messages,
      temperature: options.temperature ?? 0.2,
      max_tokens: options.maxTokens ?? 500
    };
    if (options.responseFormat === "json_object") {
      body.response_format = { type: "json_object" };
    }

    try {
      const response = await axios.post(url, body, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.config.zhipuApiKey}`
        },
        timeout: options.timeoutMs ?? 15000
      });

      const data = response.data || {};
      const choice = Array.isArray(data.choices) ? data.choices[0] : null;
      const message = choice?.message || {};
      const content = typeof message.content === "string" ? message.content : "";
      const finishReason = typeof choice?.finish_reason === "string" ? choice.finish_reason : "";
      const usage = data.usage
        ? {
            promptTokens: Number(data.usage.prompt_tokens) || 0,
            completionTokens: Number(data.usage.completion_tokens) || 0,
            totalTokens: Number(data.usage.total_tokens) || 0
          }
        : undefined;

      return { content, finishReason, usage };
    } catch (error) {
      const axiosError = error as AxiosError<{ error?: { message?: string } }>;
      const status = axiosError.response?.status;
      const apiMsg = axiosError.response?.data?.error?.message;
      this.logger.warn(
        `Zhipu chat.completions failed: status=${status || "?"} msg=${apiMsg || axiosError.message}`
      );
      throw error;
    }
  }
}
