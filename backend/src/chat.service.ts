import { Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { DifyService } from "./dify.service";
import { InMemoryDataService } from "./shared/in-memory-data.service";

type StreamRecord = {
  streamId: string;
  conversationId: string;
  events: Array<Record<string, unknown>>;
  fetched: boolean;
};

@Injectable()
export class ChatService {
  private readonly streams = new Map<string, StreamRecord>();
  private readonly providerConversations = new Map<string, string>();

  constructor(
    private readonly store: InMemoryDataService,
    private readonly difyService: DifyService
  ) {}

  private resolveFallbackAgent(sceneKey?: string) {
    const source = String(sceneKey || "");

    if (source.includes("ai")) {
      return "execution";
    }

    if (source.includes("ip")) {
      return "asset";
    }

    if (source.includes("company") || source.includes("monthly")) {
      return "steward";
    }

    if (source.includes("social")) {
      return "mindset";
    }

    return "master";
  }

  getScene(sceneKey: string, user?: Record<string, unknown>) {
    return this.store.getConversationScene(sceneKey, user);
  }

  private resolveChatUserId(user?: Record<string, unknown>) {
    const source = user || this.store.getUser();
    return String(source.id || source.userId || "opc-mini-program-user");
  }

  private resolveProviderConversationId(externalConversationId?: string) {
    const key = String(externalConversationId || "").trim();
    if (!key) {
      return "";
    }

    return this.providerConversations.get(key) || "";
  }

  private bindProviderConversation(externalConversationId: string | undefined, providerConversationId: string | undefined) {
    const externalId = String(externalConversationId || "").trim();
    const providerId = String(providerConversationId || "").trim();

    if (!externalId || !providerId) {
      return;
    }

    this.providerConversations.set(externalId, providerId);
  }

  async sendMessage(
    payload: { conversationId?: string; sceneKey?: string; userMessageId?: string; message?: string },
    user?: Record<string, unknown>
  ) {
    const text = String(payload.message || "").trim();
    const fallbackAgent = this.resolveFallbackAgent(payload.sceneKey);
    const reply = this.store.resolveChatReply(text, fallbackAgent);
    const externalConversationId = payload.conversationId || `conv-${Date.now()}`;
    let assistantText = reply.text;
    let providerConversationId = this.resolveProviderConversationId(externalConversationId);

    if (text && this.difyService.isEnabled()) {
      try {
        const difyReply = await this.difyService.sendChatMessage({
          query: text,
          user: this.resolveChatUserId(user),
          conversationId: providerConversationId
        });

        assistantText = difyReply.answer || assistantText;
        providerConversationId = difyReply.conversationId || providerConversationId;
        this.bindProviderConversation(externalConversationId, providerConversationId);
      } catch (error) {
        // Keep current mock reply as a safe fallback when Dify is unavailable.
      }
    }

    this.store.appendRecentChat(`${new Date().toLocaleDateString("zh-CN")} ${text.slice(0, 12) || "新对话"}`);

    return {
      conversationId: externalConversationId,
      userMessageId: payload.userMessageId || `user-${Date.now()}`,
      assistantMessage: {
        id: `assistant-${Date.now()}`,
        type: "agent",
        text: assistantText
      },
      agentKey: reply.agentKey,
      quickReplies: reply.quickReplies,
      providerConversationId
    };
  }

  async startStream(
    payload: { conversationId?: string; sceneKey?: string; userText?: string; message?: string },
    user?: Record<string, unknown>
  ) {
    const sourceText = String(payload.userText || payload.message || "").trim();
    const fallbackAgent = this.resolveFallbackAgent(payload.sceneKey);
    const reply = this.store.resolveChatReply(sourceText, fallbackAgent);
    const streamId = `stream-${randomUUID()}`;
    const externalConversationId = payload.conversationId || `conv-${Date.now()}`;
    let finalText = reply.text || "";
    let providerConversationId = this.resolveProviderConversationId(externalConversationId);

    if (sourceText && this.difyService.isEnabled()) {
      try {
        const difyReply = await this.difyService.sendChatMessage({
          query: sourceText,
          user: this.resolveChatUserId(user),
          conversationId: providerConversationId
        });

        finalText = difyReply.answer || finalText;
        providerConversationId = difyReply.conversationId || providerConversationId;
        this.bindProviderConversation(externalConversationId, providerConversationId);
      } catch (error) {
        // Fall back to the local mock reply when Dify isn't reachable.
      }
    }

    const events = this.store.createStreamEvents(finalText).map((event) => ({
      ...event,
      streamId
    }));

    this.streams.set(streamId, {
      streamId,
      conversationId: externalConversationId,
      events,
      fetched: false
    });

    return {
      streamId,
      conversationId: externalConversationId,
      status: "streaming",
      events,
      agentKey: reply.agentKey,
      quickReplies: reply.quickReplies,
      providerConversationId
    };
  }

  getStream(streamId: string) {
    const stream = this.streams.get(streamId);

    if (!stream) {
      throw new NotFoundException(`Stream not found: ${streamId}`);
    }

    if (stream.fetched) {
      return [];
    }

    stream.fetched = true;
    return stream.events;
  }

  getLegacyConversation(sceneKey: "home" | "onboarding" | "ai" | "ip") {
    return this.store.getLegacyConversation(sceneKey);
  }
}
