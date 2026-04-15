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
  skipConversationVariableSync?: boolean;
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

  private normalizeError(
    error: unknown,
    apiKey: string,
    options: { businessError?: boolean } = {}
  ) {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError<{ message?: string; code?: string }>;
      const remoteMessage =
        axiosError.response?.data?.message ||
        axiosError.response?.statusText ||
        axiosError.message;
      const status = axiosError.response?.status;

      // axios 超时 = ECONNABORTED + response 缺失 + message 含 "timeout"。
      // 超时通常是单条 query 自身太慢(上下文过长 / 命中重工作流),不是 Dify
      // 基础设施故障。过去我们把它和 "无 status" 一起判为基础设施类故障,
      // 结果一次慢请求就会把整个 apiKey 拉黑 60 秒,60 秒后用户重试又触发
      // 同一条慢 query,再次拉黑 —— 形成"永远点不动"的死循环。
      // 现在超时只抛给调用方,不熔断,让下一次重试能立即再试一次。
      const isTimeout =
        axiosError.code === "ECONNABORTED" || /timeout of \d+ms exceeded/i.test(axiosError.message || "");

      if (status === 401) {
        this.setDisabledUntil(apiKey, Date.now() + 5 * 60 * 1000);
      } else if (isTimeout) {
        // 不熔断,留给调用方上抛 503 / 展示重试引导。
      } else if (!status || status === 429 || status >= 500) {
        // 真·基础设施类故障(网络断了 / Dify 自己 5xx / 限流)才触发熔断,
        // 整批请求一起拉黑 60 秒,避免压垮远端。
        this.setDisabledUntil(apiKey, Date.now() + 60 * 1000);
      }
      // 4xx (除 401/429) 大多是单条 query 自身问题(参数非法、会话失效等),
      // 不熔断,让下一条消息照常尝试。

      return new Error(`Dify request failed: ${this.simplifyRemoteMessage(remoteMessage)}`);
    }

    // 非 axios 错误的两种来源:
    //  1) Dify 流式里的 event:"error" —— 业务级单条失败(模型解析失败、工作流
    //     节点报错等),只影响这一句,不该拉黑整个 apiKey;调用方传 businessError=true。
    //  2) 真实的代码异常 / 未预期错误 —— 仍然按 60 秒熔断处理。
    if (!options.businessError) {
      this.setDisabledUntil(apiKey, Date.now() + 60 * 1000);
    }

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

  /**
   * 流式版本的 sendChatMessage。走 Dify SSE（response_mode: "streaming"）,每收到一个
   * message/agent_message 事件就通过 onToken 把增量文本抛给调用方。最终仍返回聚合后的
   * answer / conversationId / messageId，便于上层做 sanitize 和持久化。
   *
   * 之所以手写 SSE 而不是用 Dify 的 blocking 再假装 stream，是为了把"等待首 token"
   * 的真实延迟从后端搬到前端实时可见——用户一眼就能看到模型开始吐字。
   */
  async sendChatMessageStreaming(
    payload: DifyChatRequest,
    callbacks: {
      onToken?: (delta: string) => void;
      onMeta?: (meta: { conversationId: string; messageId: string }) => void;
    } = {},
    options: DifyRequestOptions & { signal?: AbortSignal } = {}
  ): Promise<DifyChatResponse> {
    const apiKey = this.resolveApiKey(options.apiKey);

    if (!this.isEnabled(apiKey)) {
      throw new Error("Dify is not enabled");
    }

    if (options.signal?.aborted) {
      throw new Error("Dify stream cancelled");
    }

    let response;
    try {
      response = await axios.post(
        this.buildUrl("/chat-messages"),
        {
          inputs: hasInputs(payload.inputs) ? payload.inputs : {},
          query: payload.query,
          response_mode: "streaming",
          conversation_id: payload.conversationId || "",
          user: payload.user
        },
        {
          headers: {
            ...this.buildHeaders(apiKey),
            Accept: "text/event-stream"
          },
          responseType: "stream",
          timeout: this.config.difyRequestTimeoutMs,
          signal: options.signal
        }
      );
    } catch (error) {
      // 流式请求 4xx/5xx 时 axiosError.response.data 是个 stream，normalizeError
      // 走 statusText 兜底拿到 "NOT FOUND"，丢了 Dify 真实错误信息("Conversation
      // Not Exists." 之类)。这里把 body stream 读出来、塞回 data，让上层的
      // isConversationNotExistsError 能识别，触发 conversationId 自愈重试。
      if (axios.isAxiosError(error) && error.response?.data && typeof (error.response.data as any).on === "function") {
        try {
          const bodyStream = error.response.data as NodeJS.ReadableStream;
          const chunks: Buffer[] = [];
          await new Promise<void>((resolve) => {
            bodyStream.on("data", (chunk: Buffer) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
            bodyStream.on("end", () => resolve());
            bodyStream.on("error", () => resolve());
          });
          const bodyText = Buffer.concat(chunks).toString("utf8").trim();
          if (bodyText) {
            try {
              error.response.data = JSON.parse(bodyText);
            } catch (_parseError) {
              error.response.data = { message: bodyText };
            }
          }
        } catch (_readError) {
          // 读 body 失败就维持原样,让 normalizeError 走兜底分支。
        }
      }
      throw this.normalizeError(error, apiKey);
    }

    let conversationId = "";
    let messageId = "";
    let rawAnswerBuffer = "";
    let metaEmitted = false;
    let raw: Record<string, unknown> = {};

    // 流式 <think>...</think> 过滤器:DeepSeek-R1 等推理模型会在正文前先吐
    // 一段 <think>…思考链…</think>,sanitizeAnswer 只在最终 answer 上做正则
    // 兜底,流式 onToken 转发的是原始 chunk,会让用户实时看到思考过程。这里
    // 维护一个滑动 buffer + insideThink 状态,跨 chunk 也能正确切掉,只把
    // 思考链外的文本透传给上层 onToken。
    const thinkFilterState = { insideThink: false, pending: "" };
    const filterThinkChunk = (delta: string): string => {
      if (!delta) return "";
      thinkFilterState.pending += delta;
      let output = "";
      while (thinkFilterState.pending.length > 0) {
        if (thinkFilterState.insideThink) {
          const closeIdx = thinkFilterState.pending.indexOf("</think>");
          if (closeIdx === -1) {
            // 还没等到结束标签;留住末尾最多 7 个字符以防 "</think" 被切断,
            // 其余的思考链内容直接丢弃。
            const keep = Math.min(7, thinkFilterState.pending.length);
            thinkFilterState.pending = thinkFilterState.pending.slice(-keep);
            // 但如果保留段不像 "</think>" 的前缀,就清空,避免无限滚雪球。
            if (!"</think>".startsWith(thinkFilterState.pending)) {
              thinkFilterState.pending = "";
            }
            break;
          }
          thinkFilterState.pending = thinkFilterState.pending.slice(closeIdx + "</think>".length);
          thinkFilterState.insideThink = false;
        } else {
          const openIdx = thinkFilterState.pending.indexOf("<think>");
          if (openIdx === -1) {
            // 末尾可能是 "<thi" 这种半截开标签,留 6 个字符做缓冲。
            const safeEnd = Math.max(0, thinkFilterState.pending.length - 6);
            output += thinkFilterState.pending.slice(0, safeEnd);
            thinkFilterState.pending = thinkFilterState.pending.slice(safeEnd);
            // 同样:如果保留段不像 "<think>" 的前缀,就直接吐出去。
            if (thinkFilterState.pending && !"<think>".startsWith(thinkFilterState.pending)) {
              output += thinkFilterState.pending;
              thinkFilterState.pending = "";
            }
            break;
          }
          output += thinkFilterState.pending.slice(0, openIdx);
          thinkFilterState.pending = thinkFilterState.pending.slice(openIdx + "<think>".length);
          thinkFilterState.insideThink = true;
        }
      }
      return output;
    };
    const flushThinkFilter = (): string => {
      // 流结束时把 buffer 里残留的非思考链内容吐出去(防止半截 buffer 卡住)。
      if (thinkFilterState.insideThink) {
        thinkFilterState.pending = "";
        return "";
      }
      const remaining = thinkFilterState.pending;
      thinkFilterState.pending = "";
      return remaining;
    };
    const emitFilteredToken = (delta: string) => {
      const visible = filterThinkChunk(delta);
      if (visible) callbacks.onToken?.(visible);
    };

    const stream = response.data as NodeJS.ReadableStream;

    await new Promise<void>((resolve, reject) => {
      let buffer = "";

      // 外部 abort → 销毁底层 socket,立刻 reject。上层 catch 把 cancelled 当作正常停止。
      const onAbort = () => {
        try {
          (stream as unknown as { destroy?: (err?: Error) => void }).destroy?.(
            new Error("Dify stream cancelled")
          );
        } catch (_err) {
          // 已经关闭,忽略
        }
        reject(new Error("Dify stream cancelled"));
      };
      if (options.signal) {
        if (options.signal.aborted) {
          onAbort();
          return;
        }
        options.signal.addEventListener("abort", onAbort, { once: true });
      }

      stream.on("data", (chunk: Buffer) => {
        buffer += chunk.toString("utf8");
        // SSE 以 \n\n 分隔事件；一个事件里可能有多行 data:
        let separatorIndex = buffer.indexOf("\n\n");
        while (separatorIndex !== -1) {
          const rawEvent = buffer.slice(0, separatorIndex);
          buffer = buffer.slice(separatorIndex + 2);
          separatorIndex = buffer.indexOf("\n\n");

          const dataLines = rawEvent
            .split("\n")
            .filter((line) => line.startsWith("data:"))
            .map((line) => line.slice(5).trimStart());

          if (!dataLines.length) {
            continue;
          }

          const dataStr = dataLines.join("\n");
          if (!dataStr || dataStr === "[DONE]") {
            continue;
          }

          let parsed: Record<string, unknown>;
          try {
            parsed = JSON.parse(dataStr);
          } catch (_error) {
            continue;
          }

          raw = parsed;
          const eventType = String(parsed.event || "");
          const deltaConversationId = String(parsed.conversation_id || "");
          const deltaMessageId = String(parsed.message_id || "");
          if (deltaConversationId) conversationId = deltaConversationId;
          if (deltaMessageId) messageId = deltaMessageId;

          if (!metaEmitted && (conversationId || messageId)) {
            metaEmitted = true;
            callbacks.onMeta?.({ conversationId, messageId });
          }

          if (eventType === "message" || eventType === "agent_message") {
            const answerDelta = String(parsed.answer || "");
            if (answerDelta) {
              rawAnswerBuffer += answerDelta;
              emitFilteredToken(answerDelta);
            }
          } else if (eventType === "message_end") {
            // Dify 在 message_end 里有时会带最终完整 answer（不一定都带）。
            const finalAnswer = String(parsed.answer || "");
            if (finalAnswer && finalAnswer.length > rawAnswerBuffer.length) {
              const tail = finalAnswer.slice(rawAnswerBuffer.length);
              rawAnswerBuffer = finalAnswer;
              if (tail) emitFilteredToken(tail);
            }
            const trailing = flushThinkFilter();
            if (trailing) callbacks.onToken?.(trailing);
          } else if (eventType === "error") {
            // Dify 工作流业务级失败(常见:"Run failed: Failed to parse structured output",
            // 单个节点崩了)。只标记这条 query 失败,不熔断 apiKey,下一句还能正常调。
            const message = String(parsed.message || "Dify stream error");
            reject(this.normalizeError(new Error(message), apiKey, { businessError: true }));
            return;
          }
        }
      });

      stream.on("end", () => {
        // 兜底:有些 Dify 工作流不发 message_end,只是直接关流,这里再 flush
        // 一次,把过滤器 buffer 里残留的可见文本吐出去。
        const trailing = flushThinkFilter();
        if (trailing) callbacks.onToken?.(trailing);
        resolve();
      });
      stream.on("error", (error) => reject(this.normalizeError(error, apiKey)));
    });

    return {
      conversationId,
      answer: this.sanitizeAnswer(rawAnswerBuffer),
      messageId,
      raw
    };
  }

  async sendChatMessageWithContext(
    payload: DifyChatRequest,
    options: DifyRequestOptions = {}
  ): Promise<DifyChatResponse> {
    if (!payload.conversationId) {
      return this.sendChatMessage(payload, options);
    }

    if (hasInputs(payload.inputs) && !options.skipConversationVariableSync) {
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
          // Dify validates required input-form fields on every chat request,
          // even when continuing an existing conversation.
          inputs: payload.inputs
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

export function isDifyConversationNotExistsError(error: unknown) {
  return isConversationNotExistsError(error);
}
