import { Injectable, Logger } from "@nestjs/common";
import axios, { AxiosError } from "axios";
import { getAppConfig } from "./shared/app-config";

type DifyChatRequest = {
  query: string;
  user: string;
  conversationId?: string;
  inputs?: Record<string, unknown>;
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

type DifyConversationVariable = {
  id: string;
  name: string;
  value: unknown;
};

type DifyWorkflowRequest = {
  inputs: Record<string, unknown>;
  user: string;
  workflowId?: string;
};

type DifyWorkflowResponse = {
  taskId: string;
  workflowRunId: string;
  status: string;
  outputs: Record<string, unknown>;
  raw: Record<string, unknown>;
};

@Injectable()
export class DifyService {
  private readonly logger = new Logger(DifyService.name);
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
          inputs: hasInputs(payload.inputs) ? payload.inputs : {},
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

  async sendChatMessageWithContext(
    payload: DifyChatRequest,
    options: DifyRequestOptions = {}
  ): Promise<DifyChatResponse> {
    if (!payload.conversationId) {
      return this.sendChatMessage(payload, options);
    }

    if (hasInputs(payload.inputs)) {
      try {
        await this.syncConversationVariables({
          conversationId: payload.conversationId,
          user: payload.user,
          inputs: payload.inputs || {},
          apiKey: options.apiKey
        });
      } catch (error) {
        if (isConversationNotExistsError(error)) {
          return this.sendChatMessage(
            {
              ...payload,
              conversationId: undefined
            },
            options
          );
        }

        this.logger.warn(`Failed to sync Dify conversation variables: ${this.simplifyRemoteMessage(resolveErrorMessage(error))}`);
      }
    }

    try {
      return await this.sendChatMessage(
        {
          ...payload,
          inputs: undefined
        },
        options
      );
    } catch (error) {
      if (payload.conversationId && isConversationNotExistsError(error)) {
        return this.sendChatMessage(
          {
            ...payload,
            conversationId: undefined
          },
          options
        );
      }

      throw error;
    }
  }

  async getConversationVariables(
    conversationId: string,
    user: string,
    options: DifyRequestOptions = {}
  ): Promise<Record<string, unknown>> {
    const apiKey = this.resolveApiKey(options.apiKey);

    if (!this.isEnabled(apiKey)) {
      throw new Error("Dify is not enabled");
    }

    const variables = await this.listConversationVariables(conversationId, user, apiKey);
    return variables.reduce<Record<string, unknown>>((acc, item) => {
      acc[item.name] = item.value;
      return acc;
    }, {});
  }

  async runWorkflow(
    payload: DifyWorkflowRequest,
    options: DifyRequestOptions = {}
  ): Promise<DifyWorkflowResponse> {
    const apiKey = this.resolveApiKey(options.apiKey);

    if (!this.isEnabled(apiKey)) {
      throw new Error("Dify is not enabled");
    }

    const pathname = payload.workflowId
      ? `/workflows/${encodeURIComponent(payload.workflowId)}/run`
      : "/workflows/run";

    const response = await axios
      .post(
        this.buildUrl(pathname),
        {
          inputs: payload.inputs || {},
          response_mode: "blocking",
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
    const execution =
      data.data && typeof data.data === "object" && !Array.isArray(data.data)
        ? data.data as Record<string, unknown>
        : {};
    const outputs =
      execution.outputs && typeof execution.outputs === "object" && !Array.isArray(execution.outputs)
        ? execution.outputs as Record<string, unknown>
        : {};

    return {
      taskId: String(data.task_id || ""),
      workflowRunId: String(data.workflow_run_id || execution.id || ""),
      status: String(execution.status || ""),
      outputs,
      raw: data
    };
  }

  private async syncConversationVariables(input: {
    conversationId: string;
    user: string;
    inputs: Record<string, unknown>;
    apiKey?: string;
  }) {
    const apiKey = this.resolveApiKey(input.apiKey);

    if (!this.isEnabled(apiKey)) {
      throw new Error("Dify is not enabled");
    }

    const variables = await this.listConversationVariables(input.conversationId, input.user, apiKey);
    const variableMap = new Map<string, DifyConversationVariable>();
    variables.forEach((item) => {
      variableMap.set(item.name, item);
    });

    const updates = Object.entries(input.inputs)
      .filter(([, value]) => value !== undefined)
      .map(([name, value]) => {
        const variable = variableMap.get(name);
        if (!variable) {
          this.logger.warn(`Dify conversation variable is missing: ${name}`);
          return Promise.resolve();
        }

        return this.updateConversationVariable(input.conversationId, variable.id, input.user, value, apiKey);
      });

    const settled = await Promise.allSettled(updates);
    const invalidConversation = settled.find(
      (result) => result.status === "rejected" && isConversationNotExistsError(result.reason)
    );

    if (invalidConversation && invalidConversation.status === "rejected") {
      throw invalidConversation.reason;
    }

    settled.forEach((result) => {
      if (result.status === "rejected") {
        this.logger.warn(`Failed to update Dify conversation variable: ${this.simplifyRemoteMessage(resolveErrorMessage(result.reason))}`);
      }
    });
  }

  private async listConversationVariables(conversationId: string, user: string, apiKey: string) {
    const response = await axios
      .get(this.buildUrl(`/conversations/${encodeURIComponent(conversationId)}/variables`), {
        headers: this.buildHeaders(apiKey),
        params: {
          user,
          limit: 100
        },
        timeout: this.config.difyRequestTimeoutMs
      })
      .catch((error) => {
        throw this.normalizeError(error, apiKey);
      });

    const payload = response.data && typeof response.data === "object" ? response.data as Record<string, unknown> : {};
    const records = Array.isArray(payload.data) ? payload.data : [];

    return records
      .map((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) {
          return null;
        }

        const record = item as Record<string, unknown>;
        const id = String(record.id || "").trim();
        const name = String(record.name || "").trim();
        if (!id || !name) {
          return null;
        }

        return {
          id,
          name,
          value: record.value
        } satisfies DifyConversationVariable;
      })
      .filter((item): item is DifyConversationVariable => !!item);
  }

  private async updateConversationVariable(
    conversationId: string,
    variableId: string,
    user: string,
    value: unknown,
    apiKey: string
  ) {
    await axios
      .put(
        this.buildUrl(`/conversations/${encodeURIComponent(conversationId)}/variables/${encodeURIComponent(variableId)}`),
        {
          value,
          user
        },
        {
          headers: this.buildHeaders(apiKey),
          timeout: this.config.difyRequestTimeoutMs
        }
      )
      .catch((error) => {
        throw this.normalizeError(error, apiKey);
      });
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

function hasInputs(inputs?: Record<string, unknown>) {
  return !!inputs && Object.keys(inputs).length > 0;
}

function resolveErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error || "unknown_error");
}

function isConversationNotExistsError(error: unknown) {
  const message = resolveErrorMessage(error);
  return /conversation not exists/i.test(message);
}
