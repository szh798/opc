import { Injectable, Logger, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { MessageRole, Prisma, RouterAgentKey } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { DifySnapshotContextService } from "./dify-snapshot-context.service";
import { DifyService, isDifyConversationNotExistsError, isRecoverableDifyError } from "./dify.service";
import { GrowthService } from "./growth.service";
import { getAppConfig } from "./shared/app-config";
import { getAgentMeta, inferAgentKeyFromScene, resolveSceneAgentKey } from "./shared/catalog";
import { PrismaService } from "./shared/prisma.service";
import { loadOptionalRootModule } from "./shared/root-loader";
import { UserService } from "./user.service";

type MockChatFlowModule = {
  resolveAgentByText: (text: string, fallback?: string) => string;
  getReplyByAgent: (agentKey: string, text: string) => {
    text: string;
    quickReplies: Array<Record<string, unknown>>;
  };
};

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  private readonly config = getAppConfig();
  private readonly mockChatFlow = loadOptionalRootModule<MockChatFlowModule>("services/mock-chat-flow.service.js");

  constructor(
    private readonly prisma: PrismaService,
    private readonly difyService: DifyService,
    private readonly difySnapshotContextService: DifySnapshotContextService,
    private readonly growthService: GrowthService,
    private readonly userService: UserService
  ) {}

  private buildDegradedReply(userText: string, fallbackAgent: string) {
    if (this.mockChatFlow) {
      const mockAgent = this.mockChatFlow.resolveAgentByText(userText, fallbackAgent);
      const mockReply = this.mockChatFlow.getReplyByAgent(mockAgent, userText);
      return {
        text: mockReply.text,
        agentKey: mockAgent,
        quickReplies: mockReply.quickReplies || [],
        providerConversationId: "",
        providerMessageId: ""
      };
    }

    return {
      text: "我先接住这个问题。当前上游响应不稳定，我们先把关键情况说清楚：你现在最想推进的是方向、成交，还是执行？",
      agentKey: fallbackAgent,
      quickReplies: [],
      providerConversationId: "",
      providerMessageId: ""
    };
  }

  getScene(sceneKey: string, user?: Record<string, unknown> | null) {
    const key = String(sceneKey || "home").trim() || "home";
    const agentKey = resolveSceneAgentKey(key);

    return {
      key,
      sceneKey: key,
      agentKey,
      agent: getAgentMeta(agentKey),
      user: user || null
    };
  }

  async sendMessage(
    payload: { conversationId?: string; sceneKey?: string; userMessageId?: string; message?: string; content?: string },
    user?: Record<string, unknown>
  ) {
    const userId = this.resolveChatUserId(user);
    const text = String(payload.message || payload.content || "").trim();
    const conversationId = String(payload.conversationId || `conv-${randomUUID()}`).trim() || `conv-${randomUUID()}`;
    const agentKey = inferAgentKeyFromScene(payload.sceneKey || "");
    const label = this.buildConversationLabel(text);
    const conversation = await this.ensureConversation(userId, conversationId, payload.sceneKey, label);
    const providerConversationId = await this.resolveProviderConversationId(conversation.id);

    const userMessageId = String(payload.userMessageId || `user-${randomUUID()}`);
    await this.persistMessage({
      id: userMessageId,
      conversationId: conversation.id,
      userId,
      role: MessageRole.USER,
      type: "user",
      text
    });

    const reply = await this.resolveReply({
      conversationId: conversation.id,
      sceneKey: payload.sceneKey,
      userId,
      userText: text,
      providerConversationId
    });

    const assistantMessageId = `assistant-${randomUUID()}`;
    await this.persistMessage({
      id: assistantMessageId,
      conversationId: conversation.id,
      userId,
      role: MessageRole.ASSISTANT,
      type: "agent",
      text: reply.text,
      agentKey: reply.agentKey,
      providerMessageId: reply.providerMessageId
    });

    await this.touchConversation(conversation.id, label);
    await this.growthService.touch(userId).catch(() => undefined);

    return {
      conversationId: conversation.id,
      userMessageId,
      assistantMessage: {
        id: assistantMessageId,
        type: "agent",
        text: reply.text
      },
      agentKey: reply.agentKey || agentKey,
      quickReplies: reply.quickReplies || [],
      providerConversationId: reply.providerConversationId || providerConversationId || ""
    };
  }

  async startStream(
    payload: {
      conversationId?: string;
      sceneKey?: string;
      userText?: string;
      message?: string;
      content?: string;
    },
    user?: Record<string, unknown>
  ) {
    const userId = this.resolveChatUserId(user);
    const userText = String(payload.userText || payload.message || payload.content || "").trim();
    const conversationId = String(payload.conversationId || `conv-${randomUUID()}`).trim() || `conv-${randomUUID()}`;
    const label = this.buildConversationLabel(userText);
    const conversation = await this.ensureConversation(userId, conversationId, payload.sceneKey, label);
    const providerConversationId = await this.resolveProviderConversationId(conversation.id);

    const userMessageId = `user-${randomUUID()}`;
    await this.persistMessage({
      id: userMessageId,
      conversationId: conversation.id,
      userId,
      role: MessageRole.USER,
      type: "user",
      text: userText
    });

    const streamId = `stream-${randomUUID()}`;
    await this.prisma.streamEvent.create({
      data: {
        streamId,
        conversationId: conversation.id,
        eventIndex: 0,
        type: "meta",
        payload: JSON.stringify({
          type: "meta",
          streamId,
          conversationId: conversation.id,
          createdAt: Date.now()
        }) as Prisma.InputJsonValue
      }
    });

    await this.touchConversation(conversation.id, label);
    void this.growthService.touch(userId).catch(() => undefined);
    void this.runStreamWorker({
      streamId,
      conversationId: conversation.id,
      sceneKey: payload.sceneKey,
      userId,
      userText,
      providerConversationId,
      label
    }).catch((error) => {
      this.logger.error(
        `runStreamWorker crashed (streamId=${streamId}): ${error instanceof Error ? error.message : String(error)}`
      );
    });

    return {
      streamId,
      conversationId: conversation.id,
      status: "streaming",
      providerConversationId: providerConversationId || ""
    };
  }

  async getStream(streamId: string, user?: Record<string, unknown>) {
    const userId = this.resolveChatUserId(user);
    const records = await this.prisma.streamEvent.findMany({
      where: {
        streamId,
        deliveredAt: null,
        conversation: {
          userId
        }
      },
      orderBy: {
        eventIndex: "asc"
      }
    });

    if (!records.length) {
      const existing = await this.prisma.streamEvent.findFirst({
        where: {
          streamId,
          conversation: {
            userId
          }
        }
      });

      if (!existing) {
        throw new NotFoundException(`Stream not found: ${streamId}`);
      }

      return [];
    }

    await this.prisma.streamEvent.updateMany({
      where: {
        id: {
          in: records.map((record) => record.id)
        }
      },
      data: {
        deliveredAt: new Date()
      }
    });

    return records.map((record) => {
      if (typeof record.payload === "string") {
        try {
          return JSON.parse(record.payload);
        } catch (error) {
          return {
            type: "error",
            streamId,
            message: "invalid_stream_payload"
          };
        }
      }

      return record.payload;
    });
  }

  getLegacyConversation(sceneKey: "home" | "onboarding" | "ai" | "ip") {
    return this.getScene(sceneKey === "onboarding" ? "onboarding_intro" : sceneKey);
  }

  async getConversation(conversationId: string, user?: Record<string, unknown>) {
    const userId = this.resolveChatUserId(user);
    const targetConversationId = String(conversationId || "").trim();

    if (!targetConversationId) {
      throw new NotFoundException("Conversation not found");
    }

    const conversation = await this.prisma.conversation.findFirst({
      where: {
        id: targetConversationId,
        userId,
        deletedAt: null
      },
      select: {
        id: true,
        sceneKey: true,
        label: true,
        updatedAt: true,
        messages: {
          orderBy: {
            createdAt: "asc"
          },
          take: 120,
          select: {
            id: true,
            role: true,
            type: true,
            text: true,
            agentKey: true,
            createdAt: true
          }
        }
      }
    });

    if (!conversation) {
      throw new NotFoundException(`Conversation not found: ${targetConversationId}`);
    }

    return {
      id: conversation.id,
      conversationId: conversation.id,
      sceneKey: conversation.sceneKey || "",
      label: conversation.label || "",
      updatedAt: conversation.updatedAt,
      messages: conversation.messages.map((item) => ({
        id: item.id,
        type: item.type || (item.role === MessageRole.USER ? "user" : "agent"),
        text: item.text,
        agentKey: item.agentKey || "",
        createdAt: item.createdAt
      }))
    };
  }

  async deleteConversation(conversationId: string, user?: Record<string, unknown> | null) {
    const userId = await this.resolveManagedUserId(user);
    const targetConversationId = String(conversationId || "").trim();

    if (!targetConversationId) {
      throw new NotFoundException("Conversation not found");
    }

    const result = await this.prisma.conversation.updateMany({
      where: {
        id: targetConversationId,
        userId,
        deletedAt: null
      },
      data: {
        deletedAt: new Date()
      }
    });

    if (!result.count) {
      throw new NotFoundException(`Conversation not found: ${targetConversationId}`);
    }

    return {
      success: true,
      id: targetConversationId
    };
  }

  async clearConversations(user?: Record<string, unknown> | null) {
    const userId = await this.resolveManagedUserId(user);
    const result = await this.prisma.conversation.updateMany({
      where: {
        userId,
        deletedAt: null
      },
      data: {
        deletedAt: new Date()
      }
    });

    return {
      success: true,
      count: result.count
    };
  }

  private resolveChatUserId(user?: Record<string, unknown>) {
    return String((user && user.id) || "").trim();
  }

  private async resolveManagedUserId(user?: Record<string, unknown> | null) {
    const resolvedUser = await this.userService.getUserOrDemo(String((user && user.id) || ""));
    return resolvedUser.id;
  }

  private buildConversationLabel(text: string) {
    const date = new Intl.DateTimeFormat("zh-CN", {
      month: "numeric",
      day: "numeric"
    }).format(new Date());

    return `${date} ${String(text || "").slice(0, 12) || "新对话"}`;
  }

  private async ensureConversation(userId: string, conversationId: string, sceneKey?: string, label?: string) {
    const existing = await this.prisma.conversation.findFirst({
      where: {
        id: conversationId,
        userId,
        deletedAt: null
      }
    });

    if (existing) {
      return existing;
    }

    return this.prisma.conversation.create({
      data: {
        id: conversationId,
        userId,
        sceneKey: sceneKey || "",
        label: label || "新对话",
        lastMessageAt: new Date()
      }
    });
  }

  private async touchConversation(conversationId: string, label: string) {
    await this.prisma.conversation.update({
      where: {
        id: conversationId
      },
      data: {
        label,
        lastMessageAt: new Date()
      }
    });
  }

  private async persistMessage(input: {
    id: string;
    conversationId: string;
    userId: string;
    role: MessageRole;
    type: string;
    text: string;
    agentKey?: string;
    providerMessageId?: string;
  }) {
    await this.prisma.message.create({
      data: {
        id: input.id,
        conversationId: input.conversationId,
        userId: input.userId,
        role: input.role,
        type: input.type,
        text: input.text,
        agentKey: input.agentKey,
        providerMessageId: input.providerMessageId
      }
    });
  }

  private async resolveProviderConversationId(conversationId: string) {
    const binding = await this.prisma.providerConversation.findUnique({
      where: {
        conversationId
      }
    });

    return binding?.providerConversationId || "";
  }

  private async bindProviderConversation(
    conversationId: string,
    providerConversationId?: string,
    providerMessageId?: string
  ) {
    if (!providerConversationId) {
      return;
    }

    await this.prisma.providerConversation.upsert({
      where: {
        conversationId
      },
      create: {
        conversationId,
        providerConversationId,
        lastProviderMessageId: providerMessageId
      },
      update: {
        providerConversationId,
        lastProviderMessageId: providerMessageId
      }
    });
  }

  private async resolveReply(input: {
    conversationId: string;
    sceneKey?: string;
    userId: string;
    userText: string;
    providerConversationId?: string;
  }) {
    const fallbackAgent = inferAgentKeyFromScene(input.sceneKey || "");

    if (this.difyService.isEnabled()) {
      try {
        const snapshotContext = await this.difySnapshotContextService.buildSnapshotInputs(input.userId, {
          channel: "chat",
          agentKey: fallbackAgent as RouterAgentKey
        });
        const difyReply = await this.difyService.sendChatMessageWithContext({
          query: input.userText,
          user: input.userId,
          conversationId: input.providerConversationId,
          inputs: snapshotContext.inputs
        });

        await this.bindProviderConversation(
          input.conversationId,
          difyReply.conversationId || undefined,
          difyReply.messageId || undefined
        );

        return {
          text: difyReply.answer || "收到，我继续帮你往下拆。",
          agentKey: fallbackAgent,
          quickReplies: [],
          providerConversationId: difyReply.conversationId || input.providerConversationId || "",
          providerMessageId: difyReply.messageId || ""
        };
      } catch (error) {
        if (!this.config.devMockDify && !isRecoverableDifyError(error)) {
          throw new ServiceUnavailableException(error instanceof Error && error.message.trim() ? error.message : "Dify is unavailable");
        }
        return this.buildDegradedReply(input.userText, fallbackAgent);
      }
    }

    if (this.mockChatFlow) {
      const mockAgent = this.mockChatFlow.resolveAgentByText(input.userText, fallbackAgent);
      const mockReply = this.mockChatFlow.getReplyByAgent(mockAgent, input.userText);

      return {
        text: mockReply.text,
        agentKey: mockAgent,
        quickReplies: mockReply.quickReplies || [],
        providerConversationId: input.providerConversationId || "",
        providerMessageId: ""
      };
    }

    return this.buildDegradedReply(input.userText, fallbackAgent);
  }

  private async runStreamWorker(input: {
    streamId: string;
    conversationId: string;
    sceneKey?: string;
    userId: string;
    userText: string;
    providerConversationId?: string;
    label: string;
  }) {
    const fallbackAgent = inferAgentKeyFromScene(input.sceneKey || "");
    let eventIndex = 1;
    let terminalEventWritten = false;

    const writeEvent = async (event: Record<string, unknown>) => {
      const currentIndex = eventIndex;
      eventIndex += 1;
      await this.prisma.streamEvent.create({
        data: {
          streamId: input.streamId,
          conversationId: input.conversationId,
          eventIndex: currentIndex,
          type: String(event.type || "token"),
          payload: JSON.stringify(event) as Prisma.InputJsonValue
        }
      });
    };

    const writeDone = async (status: "success" | "error", completionTokens: number) => {
      if (terminalEventWritten) {
        return;
      }
      terminalEventWritten = true;
      await writeEvent({
        type: "done",
        streamId: input.streamId,
        status,
        usage: {
          promptTokens: 0,
          completionTokens
        }
      });
    };

    const writeStaticReply = async (text: string) => {
      for (const [index, token] of Array.from(String(text || "")).entries()) {
        await writeEvent({
          type: "token",
          streamId: input.streamId,
          token,
          index
        });
      }
    };

    try {
      let replyText = "";
      let replyAgentKey = fallbackAgent;
      let replyProviderConversationId = input.providerConversationId || "";
      let replyProviderMessageId = "";

      if (this.difyService.isEnabled()) {
        try {
          const snapshotContext = await this.difySnapshotContextService.buildSnapshotInputs(input.userId, {
            channel: "chat",
            agentKey: fallbackAgent as RouterAgentKey
          });
          const onToken = async (delta: string) => {
            if (!delta) {
              return;
            }
            replyText += delta;
            await writeEvent({
              type: "token",
              streamId: input.streamId,
              token: delta
            });
          };

          let difyReply;
          try {
            difyReply = await this.difyService.sendChatMessageStreaming(
              {
                query: input.userText,
                user: input.userId,
                conversationId: input.providerConversationId,
                inputs: snapshotContext.inputs
              },
              {
                onToken,
                onMeta: ({ conversationId, messageId }) => {
                  if (conversationId) {
                    replyProviderConversationId = conversationId;
                  }
                  if (messageId) {
                    replyProviderMessageId = messageId;
                  }
                }
              }
            );
          } catch (error) {
            if (input.providerConversationId && isDifyConversationNotExistsError(error)) {
              difyReply = await this.difyService.sendChatMessageStreaming(
                {
                  query: input.userText,
                  user: input.userId,
                  conversationId: "",
                  inputs: snapshotContext.inputs
                },
                {
                  onToken,
                  onMeta: ({ conversationId, messageId }) => {
                    if (conversationId) {
                      replyProviderConversationId = conversationId;
                    }
                    if (messageId) {
                      replyProviderMessageId = messageId;
                    }
                  }
                }
              );
            } else {
              throw error;
            }
          }

          replyText = String(difyReply.answer || "").trim() || replyText;
          replyProviderConversationId = difyReply.conversationId || replyProviderConversationId;
          replyProviderMessageId = difyReply.messageId || replyProviderMessageId;
        } catch (error) {
          if (!this.config.devMockDify && !isRecoverableDifyError(error)) {
            throw error;
          }
          const degraded = this.buildDegradedReply(input.userText, fallbackAgent);
          replyText = degraded.text;
          replyAgentKey = degraded.agentKey;
          replyProviderConversationId = degraded.providerConversationId || replyProviderConversationId;
          replyProviderMessageId = degraded.providerMessageId || replyProviderMessageId;
          if (!replyText) {
            replyText = "我先接住这个问题。当前上游响应不稳定，我们先把关键信息说清楚。";
          }
          await writeStaticReply(replyText);
        }
      } else {
        const fallbackReply = this.buildDegradedReply(input.userText, fallbackAgent);
        replyText = fallbackReply.text;
        replyAgentKey = fallbackReply.agentKey;
        replyProviderConversationId = fallbackReply.providerConversationId || replyProviderConversationId;
        replyProviderMessageId = fallbackReply.providerMessageId || replyProviderMessageId;
        await writeStaticReply(replyText);
      }

      if (replyProviderConversationId) {
        await this.bindProviderConversation(
          input.conversationId,
          replyProviderConversationId,
          replyProviderMessageId || undefined
        );
      }

      await this.persistMessage({
        id: `assistant-${randomUUID()}`,
        conversationId: input.conversationId,
        userId: input.userId,
        role: MessageRole.ASSISTANT,
        type: "agent",
        text: replyText,
        agentKey: replyAgentKey,
        providerMessageId: replyProviderMessageId
      });

      await this.touchConversation(input.conversationId, input.label);
      await writeDone("success", Array.from(String(replyText || "")).length);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      try {
        await writeEvent({
          type: "error",
          streamId: input.streamId,
          message
        });
        await writeDone("error", 0);
      } catch (_writeError) {
        // ignore secondary write failures; original error is logged below
      }
      this.logger.error(`Chat streaming worker failed (streamId=${input.streamId}): ${message}`);
    }
  }
}
