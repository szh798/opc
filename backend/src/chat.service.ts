import { Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { MessageRole, Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { DifyService } from "./dify.service";
import { GrowthService } from "./growth.service";
import { getAppConfig } from "./shared/app-config";
import { getAgentMeta, inferAgentKeyFromScene, resolveSceneAgentKey } from "./shared/catalog";
import { PrismaService } from "./shared/prisma.service";
import { loadRootModule } from "./shared/root-loader";

type MockChatFlowModule = {
  resolveAgentByText: (text: string, fallback?: string) => string;
  getReplyByAgent: (agentKey: string, text: string) => {
    text: string;
    quickReplies: Array<Record<string, unknown>>;
  };
};

@Injectable()
export class ChatService {
  private readonly config = getAppConfig();
  private readonly mockChatFlow = this.config.devMockDify
    ? loadRootModule<MockChatFlowModule>("services/mock-chat-flow.service.js")
    : null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly difyService: DifyService,
    private readonly growthService: GrowthService
  ) {}

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

    const reply = await this.resolveReply({
      conversationId: conversation.id,
      sceneKey: payload.sceneKey,
      userId,
      userText,
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

    const streamId = `stream-${randomUUID()}`;
    const events = this.buildStreamEvents(streamId, reply.text);

    await this.prisma.$transaction(
      events.map((event, index) =>
        this.prisma.streamEvent.create({
          data: {
            streamId,
            conversationId: conversation.id,
            eventIndex: index,
            type: String(event.type || "message"),
            payload: JSON.stringify(event) as Prisma.InputJsonValue
          }
        })
      )
    );

    await this.touchConversation(conversation.id, label);
    await this.growthService.touch(userId).catch(() => undefined);

    return {
      streamId,
      conversationId: conversation.id,
      status: "streaming",
      providerConversationId: reply.providerConversationId || providerConversationId || ""
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

  private resolveChatUserId(user?: Record<string, unknown>) {
    return String((user && user.id) || "").trim();
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
        const difyReply = await this.difyService.sendChatMessage({
          query: input.userText,
          user: input.userId,
          conversationId: input.providerConversationId
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
        if (!this.config.devMockDify) {
          throw new ServiceUnavailableException(error instanceof Error && error.message.trim() ? error.message : "Dify is unavailable");
        }
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

    throw new ServiceUnavailableException("Dify is unavailable");
  }

  private buildStreamEvents(streamId: string, text: string) {
    const content = String(text || "");
    const tokens = content ? Array.from(content) : [];
    const events: Array<Record<string, unknown>> = [
      {
        type: "meta",
        streamId,
        createdAt: Date.now()
      }
    ];

    tokens.forEach((token, index) => {
      events.push({
        type: "token",
        streamId,
        token,
        index
      });
    });

    events.push({
      type: "done",
      streamId,
      usage: {
        promptTokens: 0,
        completionTokens: tokens.length
      }
    });

    return events;
  }
}
