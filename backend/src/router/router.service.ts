import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException
} from "@nestjs/common";
import {
  BehaviorEventType,
  MemoryCategory,
  MessageRole,
  Prisma,
  RouterAgentKey,
  RouterMode,
  RouterSessionStatus,
  User
} from "@prisma/client";
import { randomUUID } from "node:crypto";
import { DifyService } from "../dify.service";
import { getAppConfig } from "../shared/app-config";
import { loadRootModule } from "../shared/root-loader";
import { PrismaService } from "../shared/prisma.service";
import {
  AGENT_DISPLAY,
  CHATFLOW_BY_AGENT,
  getQuickRepliesByAgent,
  resolveActionDecision,
  ROUTER_AGENTS
} from "./router.constants";
import {
  CreateRouterSessionDto,
  RouterAgentSwitchDto,
  RouterQuickReplyDto,
  StartRouterStreamInputDto
} from "./router.dto";

type MockChatFlowModule = {
  resolveAgentByText: (text: string, fallback?: string) => string;
  getReplyByAgent: (
    agentKey: string,
    text: string
  ) => {
    text: string;
    quickReplies: Array<Record<string, unknown>>;
  };
};

type SessionSnapshot = {
  sessionId: string;
  conversationStateId: string;
  agentKey: RouterAgentKey;
  routeMode: RouterMode;
  status: RouterSessionStatus;
  chatflowId: string;
  activeChatflowId: string;
  currentStep: string;
  firstScreenMessages: Array<Record<string, unknown>>;
  recentMessages: Array<Record<string, unknown>>;
  quickReplies: Array<Record<string, unknown>>;
};

type RoutingDecision = {
  agentKey: RouterAgentKey;
  mode: RouterMode;
  chatflowId: string;
  cardType?: string;
  routeReason: string;
};

@Injectable()
export class RouterService {
  private readonly config = getAppConfig();
  private readonly mockChatFlow: MockChatFlowModule | null = this.config.devMockDify
    ? loadRootModule<MockChatFlowModule>("services/mock-chat-flow.service.js")
    : null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly difyService: DifyService
  ) {}

  async createOrResumeSession(payload: CreateRouterSessionDto, user?: Record<string, unknown>) {
    const userId = this.resolveUserId(user);
    const userRecord = await this.getUserOrThrow(userId);
    const sessionId = String(payload.sessionId || "").trim();

    let state = sessionId
      ? await this.prisma.conversationState.findFirst({
          where: {
            id: sessionId,
            userId,
            status: "in_progress"
          }
        })
      : await this.prisma.conversationState.findFirst({
          where: {
            userId,
            status: "in_progress"
          },
          orderBy: {
            updatedAt: "desc"
          }
        });

    if (!state) {
      state = await this.prisma.conversationState.create({
        data: {
          userId,
          chatflowId: CHATFLOW_BY_AGENT.master,
          agentKey: "master",
          mode: "guided",
          status: "in_progress",
          currentStep: "session_created",
          parkingLot: toJson({
            source: payload.source || "conversation_page"
          })
        }
      });
      await this.logBehavior(userId, "app_open", {
        conversationStateId: state.id,
        source: payload.source || "conversation_page"
      });
    }

    await this.ensureConversationBridge(state.id, userId, state.agentKey);
    return this.buildSessionSnapshot(state, userRecord, true);
  }

  async getSession(sessionId: string, user?: Record<string, unknown>) {
    const userId = this.resolveUserId(user);
    const userRecord = await this.getUserOrThrow(userId);
    const state = await this.findOwnedStateOrThrow(sessionId, userId);
    await this.ensureConversationBridge(state.id, userId, state.agentKey);
    return this.buildSessionSnapshot(state, userRecord, false);
  }

  async startStream(sessionId: string, input: StartRouterStreamInputDto, user?: Record<string, unknown>) {
    const userId = this.resolveUserId(user);
    const userRecord = await this.getUserOrThrow(userId);
    const state = await this.findOwnedStateOrThrow(sessionId, userId);
    const conversationId = await this.ensureConversationBridge(state.id, userId, state.agentKey);

    const decision = await this.resolveRoutingDecision(state, input, userRecord);
    const memoryEntries = await this.fetchMemoryForAgent(userId, decision.agentKey);
    const userText = this.normalizeInputText(input);
    const generated = await this.generateAssistantReply({
      userId,
      agentKey: decision.agentKey,
      userText,
      difyConversationId: state.difyConversationId || "",
      memoryEntries
    });

    const streamId = `router-stream-${randomUUID()}`;
    const events = this.buildStreamEvents(streamId, {
      sessionId: state.id,
      agentKey: decision.agentKey,
      routeMode: decision.mode,
      chatflowId: decision.chatflowId,
      text: generated.answer,
      cardType: decision.cardType,
      routeReason: decision.routeReason
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.conversationState.update({
        where: { id: state.id },
        data: {
          agentKey: decision.agentKey,
          mode: decision.mode,
          chatflowId: decision.chatflowId,
          status: this.deriveSessionStatus(input, userText),
          currentStep: this.deriveNextStep(decision, input),
          difyConversationId: generated.difyConversationId || state.difyConversationId
        }
      });

      if (userText) {
        await tx.message.create({
          data: {
            id: `router-user-${randomUUID()}`,
            conversationId,
            userId,
            role: MessageRole.USER,
            type: "user",
            text: userText,
            agentKey: decision.agentKey
          }
        });
      }

      await tx.message.create({
        data: {
          id: `router-assistant-${randomUUID()}`,
          conversationId,
          userId,
          role: MessageRole.ASSISTANT,
          type: "agent",
          text: generated.answer,
          agentKey: decision.agentKey,
          providerMessageId: generated.providerMessageId
        }
      });

      for (let i = 0; i < events.length; i += 1) {
        await tx.streamEvent.create({
          data: {
            streamId,
            conversationId,
            eventIndex: i,
            type: String(events[i].type || "meta"),
            payload: toJson(events[i])
          }
        });
      }

      await tx.behaviorLog.create({
        data: {
          userId,
          eventType: "message_sent",
          eventData: toJson({
            sessionId: state.id,
            agentKey: decision.agentKey,
            inputType: input.inputType
          })
        }
      });
    });

    return {
      streamId,
      sessionId: state.id,
      conversationStateId: state.id,
      agentKey: decision.agentKey,
      routeMode: decision.mode,
      chatflowId: decision.chatflowId,
      activeChatflowId: decision.chatflowId,
      status: "streaming"
    };
  }

  async getStream(streamId: string, user?: Record<string, unknown>) {
    const userId = this.resolveUserId(user);
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
      const existed = await this.prisma.streamEvent.findFirst({
        where: {
          streamId,
          conversation: {
            userId
          }
        }
      });
      if (!existed) {
        throw new NotFoundException(`Router stream not found: ${streamId}`);
      }
      return [];
    }

    await this.prisma.streamEvent.updateMany({
      where: {
        id: {
          in: records.map((item) => item.id)
        }
      },
      data: {
        deliveredAt: new Date()
      }
    });

    return records.map((item) => parseJsonPayload(item.payload));
  }

  async switchAgent(sessionId: string, payload: RouterAgentSwitchDto, user?: Record<string, unknown>) {
    const userId = this.resolveUserId(user);
    const userRecord = await this.getUserOrThrow(userId);
    const state = await this.findOwnedStateOrThrow(sessionId, userId);
    const nextAgent = this.normalizeAgent(payload.agentKey);
    const nextMode: RouterMode = nextAgent === "master" ? "guided" : "free";
    const nextChatflow = CHATFLOW_BY_AGENT[nextAgent];

    await this.prisma.$transaction([
      this.prisma.conversationState.update({
        where: { id: state.id },
        data: {
          agentKey: nextAgent,
          mode: nextMode,
          chatflowId: nextChatflow,
          currentStep: "agent_switched"
        }
      }),
      this.prisma.behaviorLog.create({
        data: {
          userId,
          eventType: "agent_switched",
          eventData: toJson({
            conversationStateId: state.id,
            fromAgent: state.agentKey,
            toAgent: nextAgent
          })
        }
      })
    ]);

    return this.buildSessionSnapshot(
      {
        ...state,
        agentKey: nextAgent,
        mode: nextMode,
        chatflowId: nextChatflow,
        currentStep: "agent_switched"
      },
      userRecord,
      true
    );
  }

  async quickReply(sessionId: string, payload: RouterQuickReplyDto, user?: Record<string, unknown>) {
    return this.startStream(
      sessionId,
      {
        inputType: "quick_reply",
        quickReplyId: payload.quickReplyId,
        routeAction: payload.routeAction,
        metadata: payload.metadata
      },
      user
    );
  }

  async previewMemoryInjection(sessionId: string, user?: Record<string, unknown>) {
    const userId = this.resolveUserId(user);
    const state = await this.findOwnedStateOrThrow(sessionId, userId);
    const entries = await this.fetchMemoryForAgent(userId, state.agentKey);
    return {
      sessionId: state.id,
      agentKey: state.agentKey,
      count: entries.length,
      entries: entries.map((entry) => ({
        id: entry.id,
        category: entry.category,
        content: entry.content,
        confidence: entry.confidence,
        updatedAt: entry.updatedAt
      }))
    };
  }

  private resolveUserId(user?: Record<string, unknown>) {
    const userId = String((user && user.id) || "").trim();
    if (!userId) {
      throw new BadRequestException("missing user id");
    }
    return userId;
  }

  private async getUserOrThrow(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: {
        id: userId
      }
    });
    if (!user) {
      throw new NotFoundException(`User not found: ${userId}`);
    }
    return user;
  }

  private async findOwnedStateOrThrow(sessionId: string, userId: string) {
    const state = await this.prisma.conversationState.findFirst({
      where: {
        id: sessionId,
        userId
      }
    });
    if (!state) {
      throw new NotFoundException(`Router session not found: ${sessionId}`);
    }
    return state;
  }

  private buildConversationId(sessionId: string) {
    return `router-${sessionId}`;
  }

  private async ensureConversationBridge(sessionId: string, userId: string, agentKey: RouterAgentKey) {
    const conversationId = this.buildConversationId(sessionId);
    const existed = await this.prisma.conversation.findUnique({
      where: {
        id: conversationId
      }
    });
    if (existed) {
      return conversationId;
    }

    await this.prisma.conversation.create({
      data: {
        id: conversationId,
        userId,
        sceneKey: `router:${agentKey}`,
        label: `Router-${agentKey}`,
        lastMessageAt: new Date()
      }
    });
    return conversationId;
  }

  private async buildSessionSnapshot(
    state: {
      id: string;
      chatflowId: string;
      agentKey: RouterAgentKey;
      mode: RouterMode;
      status: RouterSessionStatus;
      currentStep: string | null;
    },
    user: User,
    includeFirstScreen: boolean
  ): Promise<SessionSnapshot> {
    const records = await this.prisma.message.findMany({
      where: {
        userId: user.id,
        conversationId: this.buildConversationId(state.id)
      },
      orderBy: {
        createdAt: "desc"
      },
      take: 20
    });

    const recentMessages = records.reverse().map((item) => ({
      id: item.id,
      type: item.type || (item.role === MessageRole.USER ? "user" : "agent"),
      text: item.text,
      agentKey: item.agentKey || state.agentKey,
      createdAt: item.createdAt
    }));

    const firstScreenMessages = includeFirstScreen
      ? [
          {
            id: `router-welcome-${state.id}`,
            type: "agent",
            text: this.buildAgentGreeting(state.agentKey, user.nickname || user.name || "Founder")
          }
        ]
      : [];

    return {
      sessionId: state.id,
      conversationStateId: state.id,
      agentKey: state.agentKey,
      routeMode: state.mode,
      status: state.status,
      chatflowId: state.chatflowId,
      activeChatflowId: state.chatflowId,
      currentStep: state.currentStep || "idle",
      firstScreenMessages,
      recentMessages,
      quickReplies: getQuickRepliesByAgent(state.agentKey)
    };
  }

  private buildAgentGreeting(agentKey: RouterAgentKey, nickname: string) {
    const safeName = String(nickname || "Founder").slice(0, 12);
    const display = AGENT_DISPLAY[agentKey];
    return `${safeName}, now handled by ${display.label}. Type your message or tap a quick reply.`;
  }

  private normalizeAgent(agentKey: string): RouterAgentKey {
    const normalized = String(agentKey || "").trim();
    if (ROUTER_AGENTS.includes(normalized as RouterAgentKey)) {
      return normalized as RouterAgentKey;
    }
    throw new BadRequestException(`invalid agentKey: ${agentKey}`);
  }

  private normalizeInputText(input: StartRouterStreamInputDto) {
    if (input.inputType === "text") {
      return String(input.text || "").trim();
    }
    if (input.inputType === "quick_reply") {
      const label =
        input.metadata && typeof input.metadata.quickReplyLabel === "string"
          ? String(input.metadata.quickReplyLabel).trim()
          : "";
      if (label) {
        return label;
      }
      if (input.routeAction) {
        return `[quick_reply] ${input.routeAction}`;
      }
      return `[quick_reply] ${input.quickReplyId || ""}`.trim();
    }
    if (input.inputType === "agent_switch") {
      return `[agent_switch] ${input.agentKey || ""}`.trim();
    }
    return String(input.text || "").trim();
  }

  private deriveSessionStatus(input: StartRouterStreamInputDto, userText: string): RouterSessionStatus {
    if (input.inputType === "system_event" && /abandon|close|end/i.test(userText)) {
      return "abandoned";
    }
    return "in_progress";
  }

  private deriveNextStep(decision: RoutingDecision, input: StartRouterStreamInputDto) {
    if (input.inputType === "agent_switch") {
      return "agent_switched";
    }
    if (input.inputType === "quick_reply") {
      return decision.cardType ? `artifact:${decision.cardType}` : "quick_reply_handled";
    }
    return `${decision.agentKey}:${decision.mode}`;
  }

  private buildStreamEvents(
    streamId: string,
    payload: {
      sessionId: string;
      agentKey: RouterAgentKey;
      routeMode: RouterMode;
      chatflowId: string;
      text: string;
      cardType?: string;
      routeReason: string;
    }
  ) {
    const tokens = Array.from(String(payload.text || ""));
    const events: Array<Record<string, unknown>> = [
      {
        type: "meta",
        streamId,
        sessionId: payload.sessionId,
        agentKey: payload.agentKey,
        routeMode: payload.routeMode,
        chatflowId: payload.chatflowId,
        routeReason: payload.routeReason,
        createdAt: Date.now()
      }
    ];

    for (let i = 0; i < tokens.length; i += 1) {
      events.push({
        type: "token",
        streamId,
        index: i,
        token: tokens[i]
      });
    }

    if (payload.cardType) {
      events.push({
        type: "card",
        streamId,
        cardType: payload.cardType,
        card: this.buildCardPayload(payload.cardType)
      });
    }

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

  private buildCardPayload(cardType: string) {
    const defaultCard = {
      cardType,
      title: "Stage Card",
      description: "Structured output has been generated for this step.",
      primaryText: "Open",
      secondaryText: "Later"
    };

    const registry: Record<string, Record<string, string>> = {
      asset_radar: {
        title: "Asset Radar",
        description: "Map skills, assets, and leverage points for your next move."
      },
      opportunity_score: {
        title: "Opportunity Score",
        description: "Score options by demand, effort, and payback cycle."
      },
      business_health: {
        title: "Business Health",
        description: "Review revenue quality, cash flow, and repeatability."
      },
      pricing_card: {
        title: "Pricing Card",
        description: "Build a clear and defensible pricing structure."
      },
      park_match: {
        title: "Park Match",
        description: "Match your profile to policy-friendly business parks."
      },
      action_plan_48h: {
        title: "48h Action Plan",
        description: "Generate actionable steps for the next 48 hours."
      }
    };

    if (!registry[cardType]) {
      return defaultCard;
    }

    return {
      ...defaultCard,
      ...registry[cardType]
    };
  }

  private async resolveRoutingDecision(
    state: {
      userId: string;
      agentKey: RouterAgentKey;
      mode: RouterMode;
      chatflowId: string;
    },
    input: StartRouterStreamInputDto,
    userRecord: User
  ): Promise<RoutingDecision> {
    if (input.inputType === "agent_switch" && input.agentKey) {
      const switched = this.normalizeAgent(input.agentKey);
      return {
        agentKey: switched,
        mode: switched === "master" ? "guided" : "free",
        chatflowId: CHATFLOW_BY_AGENT[switched],
        routeReason: "agent_switch"
      };
    }

    const actionDecision = resolveActionDecision(input.routeAction);
    if (actionDecision) {
      return {
        agentKey: actionDecision.agentKey,
        mode: actionDecision.mode || state.mode,
        chatflowId: actionDecision.chatflowId || CHATFLOW_BY_AGENT[actionDecision.agentKey],
        cardType: actionDecision.cardType,
        routeReason: `route_action:${input.routeAction}`
      };
    }

    const text = String(input.text || "").trim();
    if (!text) {
      return {
        agentKey: state.agentKey,
        mode: state.mode,
        chatflowId: state.chatflowId,
        routeReason: "empty_text_keep_current"
      };
    }

    if (this.isNewUserWindow(userRecord)) {
      const agent = this.routeByKeyword(text, state.agentKey);
      return {
        agentKey: agent,
        mode: "guided",
        chatflowId: CHATFLOW_BY_AGENT[agent],
        routeReason: "new_user_rule_route"
      };
    }

    const ruledAgent = this.routeByKeyword(text, null);
    if (ruledAgent) {
      return {
        agentKey: ruledAgent,
        mode: ruledAgent === "master" ? "guided" : "free",
        chatflowId: CHATFLOW_BY_AGENT[ruledAgent],
        routeReason: "keyword_rule_route"
      };
    }

    const fallback = await this.resolveLlmFallbackAgent(text, state.agentKey, userRecord.id);
    return {
      agentKey: fallback,
      mode: fallback === "master" ? "guided" : "free",
      chatflowId: CHATFLOW_BY_AGENT[fallback],
      routeReason: "llm_fallback_route"
    };
  }

  private isNewUserWindow(userRecord: User) {
    const createdAt = userRecord.createdAt instanceof Date ? userRecord.createdAt.getTime() : Date.now();
    const elapsed = Date.now() - createdAt;
    return !userRecord.onboardingCompleted && elapsed >= 0 && elapsed <= 30 * 60 * 1000;
  }

  private routeByKeyword(text: string, fallback: RouterAgentKey | null): RouterAgentKey {
    const source = String(text || "").toLowerCase();
    if (!source) {
      return fallback || "master";
    }
    if (/(park|policy|tax|company|finance|compliance|invoice)/.test(source)) {
      return "steward";
    }
    if (/(stuck|anxiety|fear|mindset|emotion|procrastination)/.test(source)) {
      return "mindset";
    }
    if (/(client|sales|conversion|revenue|growth|execute|gmv)/.test(source)) {
      return "execution";
    }
    if (/(positioning|direction|ip|content|asset|pricing)/.test(source)) {
      return "asset";
    }
    if (/(start|first step|plan|roadmap)/.test(source)) {
      return "master";
    }
    return fallback || "master";
  }

  private async resolveLlmFallbackAgent(text: string, fallback: RouterAgentKey, userId: string) {
    if (this.difyService.isEnabled()) {
      try {
        const prompt =
          "Classify this user message to one label only: master|asset|execution|mindset|steward.\n" +
          `Message: ${text}`;
        const result = await this.difyService.sendChatMessage({
          query: prompt,
          user: userId
        });
        const label = String(result.answer || "").trim().toLowerCase();
        if (ROUTER_AGENTS.includes(label as RouterAgentKey)) {
          return label as RouterAgentKey;
        }
      } catch (_error) {
        // fallback below
      }
    }

    if (this.mockChatFlow) {
      const mockAgent = String(this.mockChatFlow.resolveAgentByText(text, fallback)).trim();
      if (ROUTER_AGENTS.includes(mockAgent as RouterAgentKey)) {
        return mockAgent as RouterAgentKey;
      }
    }

    return fallback;
  }

  private async fetchMemoryForAgent(userId: string, agentKey: RouterAgentKey) {
    const categories = this.memoryCategoriesForAgent(agentKey);
    return this.prisma.memoryEntry.findMany({
      where: {
        userId,
        isActive: true,
        category: {
          in: categories
        }
      },
      orderBy: {
        updatedAt: "desc"
      },
      take: 6
    });
  }

  private memoryCategoriesForAgent(agentKey: RouterAgentKey): MemoryCategory[] {
    switch (agentKey) {
      case "asset":
        return ["skill", "resource", "business_fact", "preference"];
      case "execution":
        return ["business_fact", "behavior", "resource"];
      case "mindset":
        return ["emotional_state", "behavior", "identity"];
      case "steward":
        return ["resource", "business_fact", "preference"];
      default:
        return ["identity", "preference", "business_fact"];
    }
  }

  private async generateAssistantReply(input: {
    userId: string;
    agentKey: RouterAgentKey;
    userText: string;
    difyConversationId: string;
    memoryEntries: Array<{ content: string; category: MemoryCategory }>;
  }) {
    const query = this.buildModelQuery(input.agentKey, input.userText, input.memoryEntries);

    if (this.difyService.isEnabled()) {
      try {
        const result = await this.difyService.sendChatMessage({
          query,
          user: input.userId,
          conversationId: input.difyConversationId || undefined
        });
        return {
          answer: String(result.answer || "").trim() || "Received. Lets continue.",
          difyConversationId: result.conversationId || input.difyConversationId,
          providerMessageId: result.messageId || ""
        };
      } catch (error) {
        if (!this.config.devMockDify) {
          throw new ServiceUnavailableException(
            error instanceof Error && error.message ? error.message : "Dify is unavailable"
          );
        }
      }
    }

    if (this.mockChatFlow) {
      const mockReply = this.mockChatFlow.getReplyByAgent(input.agentKey, input.userText || query);
      return {
        answer: String(mockReply.text || "").trim() || "Received. Lets continue.",
        difyConversationId: input.difyConversationId,
        providerMessageId: ""
      };
    }

    return {
      answer: "Received. Lets lock the next action.",
      difyConversationId: input.difyConversationId,
      providerMessageId: ""
    };
  }

  private buildModelQuery(
    agentKey: RouterAgentKey,
    userText: string,
    memoryEntries: Array<{ content: string; category: MemoryCategory }>
  ) {
    const memory = memoryEntries
      .slice(0, 5)
      .map((entry, index) => `${index + 1}. [${entry.category}] ${entry.content}`)
      .join("\n");

    if (!memory) {
      return userText;
    }

    return `Agent: ${agentKey}\nMemory:\n${memory}\n\nUser: ${userText}`;
  }

  private async logBehavior(
    userId: string,
    eventType: BehaviorEventType,
    eventData?: Record<string, unknown>
  ) {
    await this.prisma.behaviorLog.create({
      data: {
        userId,
        eventType,
        eventData: toJson(eventData || {})
      }
    });
  }
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return (value ?? {}) as Prisma.InputJsonValue;
}

function parseJsonPayload(payload: Prisma.JsonValue) {
  if (typeof payload === "string") {
    try {
      return JSON.parse(payload);
    } catch (_error) {
      return {
        type: "error",
        message: "invalid_payload"
      };
    }
  }
  return payload;
}
