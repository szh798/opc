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
  currentModule: RouterAgentKey;
  routeMode: RouterMode;
  status: RouterSessionStatus;
  chatflowId: string;
  activeChatflowId: string;
  currentStep: string;
  moduleSessions: Array<{
    agentKey: RouterAgentKey;
    chatflowId: string;
    hasProviderConversation: boolean;
    lastActiveAt: string;
    lastRouteReason: string;
  }>;
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

type RouterHandoff = {
  fromAgentKey: RouterAgentKey;
  toAgentKey: RouterAgentKey;
  routeReason: string;
  summary: string;
  createdAt: string;
};

type ModuleSessionState = {
  agentKey: RouterAgentKey;
  chatflowId: string;
  difyConversationId: string;
  providerMessageId: string;
  lastRouteReason: string;
  lastActiveAt: string;
  handoffSummary: string;
};

type ParkingLotState = {
  source?: string;
  moduleSessions?: Partial<Record<RouterAgentKey, ModuleSessionState>>;
  routingContext?: {
    currentModule?: RouterAgentKey;
    previousModule?: RouterAgentKey;
    lastRouteReason?: string;
    lastInputType?: string;
    updatedAt?: string;
  };
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
    const forceNew = payload.forceNew === true;

    let state = forceNew
      ? null
      : sessionId
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
      if (forceNew) {
        await this.prisma.conversationState.updateMany({
          where: {
            userId,
            status: "in_progress"
          },
          data: {
            status: "abandoned",
            currentStep: "force_new_session"
          }
        });
      }

      const initialAgent: RouterAgentKey = "master";
      const initialChatflowId = this.resolveChatflowId(initialAgent);
      state = await this.prisma.conversationState.create({
        data: {
          userId,
          chatflowId: initialChatflowId,
          agentKey: initialAgent,
          mode: "guided",
          status: "in_progress",
          currentStep: "session_created",
          parkingLot: toJson(this.createInitialParkingLot(payload.source || "conversation_page", initialAgent))
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
    const userText = this.normalizeInputText(input);
    const parkingLot = this.parseParkingLot(state.parkingLot);
    const moduleSession = this.getModuleSessionState(parkingLot, decision.agentKey, decision.chatflowId);
    const handoff = await this.buildHandoffContext({
      userId,
      state,
      decision,
      userText,
      input,
      moduleSession
    });
    const memoryEntries = await this.fetchMemoryForAgent(userId, decision.agentKey);
    const generated = await this.generateAssistantReply({
      userId,
      agentKey: decision.agentKey,
      chatflowId: decision.chatflowId,
      userText,
      difyConversationId: moduleSession.difyConversationId || "",
      memoryEntries,
      handoff
    });
    const nextParkingLot = this.updateParkingLotAfterResponse({
      parkingLot,
      currentAgentKey: state.agentKey,
      decision,
      input,
      generated,
      handoff
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
          difyConversationId: generated.difyConversationId || moduleSession.difyConversationId || state.difyConversationId,
          parkingLot: toJson(nextParkingLot)
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
        throw new NotFoundException(`路由流不存在: ${streamId}`);
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
    const nextChatflow = this.resolveChatflowId(nextAgent);
    const parkingLot = this.parseParkingLot(state.parkingLot);
    const nextParkingLot = this.updateParkingLotRouting(parkingLot, {
      currentAgentKey: state.agentKey,
      nextAgentKey: nextAgent,
      nextChatflowId: nextChatflow,
      routeReason: "agent_switch",
      inputType: "agent_switch"
    });

    await this.prisma.$transaction([
      this.prisma.conversationState.update({
        where: { id: state.id },
        data: {
          agentKey: nextAgent,
          mode: nextMode,
          chatflowId: nextChatflow,
          currentStep: "agent_switched",
          parkingLot: toJson(nextParkingLot)
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
        currentStep: "agent_switched",
        parkingLot: nextParkingLot
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
      throw new NotFoundException(`路由会话不存在: ${sessionId}`);
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
        label: `路由会话-${agentKey}`,
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
      parkingLot?: Prisma.JsonValue | null;
    },
    user: User,
    includeFirstScreen: boolean
  ): Promise<SessionSnapshot> {
    const parkingLot = this.parseParkingLot(state.parkingLot);
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

    const firstScreenMessages: Array<Record<string, unknown>> = [];

    return {
      sessionId: state.id,
      conversationStateId: state.id,
      agentKey: state.agentKey,
      currentModule: state.agentKey,
      routeMode: state.mode,
      status: state.status,
      chatflowId: state.chatflowId,
      activeChatflowId: state.chatflowId,
      currentStep: state.currentStep || "idle",
      moduleSessions: this.listModuleSessions(parkingLot),
      firstScreenMessages,
      recentMessages,
      quickReplies: getQuickRepliesByAgent(state.agentKey)
    };
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
      title: "阶段卡片",
      description: "当前阶段的结构化结果已生成。",
      primaryText: "打开",
      secondaryText: "稍后"
    };

    const registry: Record<string, Record<string, string>> = {
      asset_radar: {
        title: "资产雷达",
        description: "盘点技能、资产与杠杆点，明确下一步发力方向。"
      },
      opportunity_score: {
        title: "机会评分",
        description: "按需求、投入和回报周期评估优先级。"
      },
      business_health: {
        title: "生意体检",
        description: "检查收入质量、现金流与可复用性。"
      },
      pricing_card: {
        title: "定价卡",
        description: "搭建清晰且有说服力的定价结构。"
      },
      park_match: {
        title: "园区匹配",
        description: "根据你的画像匹配政策友好型园区。"
      },
      action_plan_48h: {
        title: "48小时行动计划",
        description: "生成未来48小时可执行的关键动作。"
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
        chatflowId: this.resolveChatflowId(switched),
        routeReason: "agent_switch"
      };
    }

    const actionDecision = resolveActionDecision(input.routeAction);
    if (actionDecision) {
      const actionAgentKey = actionDecision.agentKey;
      return {
        agentKey: actionAgentKey,
        mode: actionDecision.mode || state.mode,
        chatflowId: this.resolveChatflowId(actionAgentKey),
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
        chatflowId: this.resolveChatflowId(agent),
        routeReason: "new_user_rule_route"
      };
    }

    const ruledAgent = this.routeByKeyword(text, null);
    if (ruledAgent) {
      return {
        agentKey: ruledAgent,
        mode: ruledAgent === "master" ? "guided" : "free",
        chatflowId: this.resolveChatflowId(ruledAgent),
        routeReason: "keyword_rule_route"
      };
    }

    const fallback = await this.resolveLlmFallbackAgent(text, state.agentKey, userRecord.id);
    return {
      agentKey: fallback,
      mode: fallback === "master" ? "guided" : "free",
      chatflowId: this.resolveChatflowId(fallback),
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
    chatflowId: string;
    userText: string;
    difyConversationId: string;
    memoryEntries: Array<{ content: string; category: MemoryCategory }>;
    handoff: RouterHandoff | null;
  }) {
    const query = this.buildModelQuery(
      input.agentKey,
      input.chatflowId,
      input.userText,
      input.memoryEntries,
      input.handoff
    );
    const difyApiKey = this.resolveDifyApiKey(input.agentKey);

    if (this.difyService.isEnabled(difyApiKey)) {
      try {
        const result = await this.sendModuleChatMessage({
          apiKey: difyApiKey,
          conversationId: input.difyConversationId || "",
          query,
          userId: input.userId
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

  private async sendModuleChatMessage(input: {
    apiKey: string;
    conversationId: string;
    query: string;
    userId: string;
  }) {
    try {
      return await this.difyService.sendChatMessage({
        query: input.query,
        user: input.userId,
        conversationId: input.conversationId || undefined
      }, {
        apiKey: input.apiKey
      });
    } catch (error) {
      if (input.conversationId && isConversationNotExistsError(error)) {
        return this.difyService.sendChatMessage({
          query: input.query,
          user: input.userId
        }, {
          apiKey: input.apiKey
        });
      }

      throw error;
    }
  }

  private buildModelQuery(
    agentKey: RouterAgentKey,
    chatflowId: string,
    userText: string,
    memoryEntries: Array<{ content: string; category: MemoryCategory }>,
    handoff: RouterHandoff | null
  ) {
    const memory = memoryEntries
      .slice(0, 5)
      .map((entry, index) => `${index + 1}. [${entry.category}] ${entry.content}`)
      .join("\n");

    const sections = [
      `Agent: ${agentKey}`,
      `Module: ${chatflowId}`
    ];

    if (handoff && handoff.summary) {
      sections.push(
        `Handoff:\nfrom=${handoff.fromAgentKey}\nto=${handoff.toAgentKey}\nreason=${handoff.routeReason}\n${handoff.summary}`
      );
    }

    if (memory) {
      sections.push(`Memory:\n${memory}`);
    }

    sections.push(`User: ${userText || "[no explicit user text]"}`);
    return sections.join("\n\n");
  }

  private resolveChatflowId(agentKey: RouterAgentKey) {
    return this.config.routerChatflowByAgent[agentKey] || CHATFLOW_BY_AGENT[agentKey];
  }

  private resolveDifyApiKey(agentKey: RouterAgentKey) {
    return this.config.difyApiKeyByAgent[agentKey] || this.config.difyApiKey;
  }

  private createInitialParkingLot(source: string, initialAgent: RouterAgentKey): ParkingLotState {
    const now = new Date().toISOString();
    const initialChatflowId = this.resolveChatflowId(initialAgent);

    return {
      source,
      moduleSessions: {
        [initialAgent]: {
          agentKey: initialAgent,
          chatflowId: initialChatflowId,
          difyConversationId: "",
          providerMessageId: "",
          lastRouteReason: "session_created",
          lastActiveAt: now,
          handoffSummary: ""
        }
      },
      routingContext: {
        currentModule: initialAgent,
        lastRouteReason: "session_created",
        lastInputType: "system_event",
        updatedAt: now
      }
    };
  }

  private parseParkingLot(value: Prisma.JsonValue | null | undefined): ParkingLotState {
    const raw = isRecord(value) ? value : {};
    const rawModuleSessions = isRecord(raw.moduleSessions) ? raw.moduleSessions : {};
    const rawRoutingContext = isRecord(raw.routingContext) ? raw.routingContext : {};
    const moduleSessions = ROUTER_AGENTS.reduce<Partial<Record<RouterAgentKey, ModuleSessionState>>>((acc, agentKey) => {
      const entry = rawModuleSessions[agentKey];
      if (!isRecord(entry)) {
        return acc;
      }

      acc[agentKey] = {
        agentKey,
        chatflowId: typeof entry.chatflowId === "string" ? entry.chatflowId : this.resolveChatflowId(agentKey),
        difyConversationId: typeof entry.difyConversationId === "string" ? entry.difyConversationId : "",
        providerMessageId: typeof entry.providerMessageId === "string" ? entry.providerMessageId : "",
        lastRouteReason: typeof entry.lastRouteReason === "string" ? entry.lastRouteReason : "",
        lastActiveAt: typeof entry.lastActiveAt === "string" ? entry.lastActiveAt : "",
        handoffSummary: typeof entry.handoffSummary === "string" ? entry.handoffSummary : ""
      };
      return acc;
    }, {});

    return {
      source: typeof raw.source === "string" ? raw.source : undefined,
      moduleSessions,
      routingContext: {
        currentModule: this.asAgentKey(rawRoutingContext.currentModule),
        previousModule: this.asAgentKey(rawRoutingContext.previousModule),
        lastRouteReason:
          typeof rawRoutingContext.lastRouteReason === "string" ? rawRoutingContext.lastRouteReason : undefined,
        lastInputType: typeof rawRoutingContext.lastInputType === "string" ? rawRoutingContext.lastInputType : undefined,
        updatedAt: typeof rawRoutingContext.updatedAt === "string" ? rawRoutingContext.updatedAt : undefined
      }
    };
  }

  private asAgentKey(value: unknown): RouterAgentKey | undefined {
    const normalized = String(value || "").trim();
    if (ROUTER_AGENTS.includes(normalized as RouterAgentKey)) {
      return normalized as RouterAgentKey;
    }
    return undefined;
  }

  private getModuleSessionState(
    parkingLot: ParkingLotState,
    agentKey: RouterAgentKey,
    chatflowId?: string
  ): ModuleSessionState {
    const existing = parkingLot.moduleSessions?.[agentKey];

    return {
      agentKey,
      chatflowId: chatflowId || existing?.chatflowId || this.resolveChatflowId(agentKey),
      difyConversationId: existing?.difyConversationId || "",
      providerMessageId: existing?.providerMessageId || "",
      lastRouteReason: existing?.lastRouteReason || "",
      lastActiveAt: existing?.lastActiveAt || "",
      handoffSummary: existing?.handoffSummary || ""
    };
  }

  private listModuleSessions(parkingLot: ParkingLotState) {
    return ROUTER_AGENTS
      .map((agentKey) => this.getModuleSessionState(parkingLot, agentKey))
      .filter((item) => !!item.lastActiveAt || !!item.difyConversationId || !!item.lastRouteReason)
      .map((item) => ({
        agentKey: item.agentKey,
        chatflowId: item.chatflowId,
        hasProviderConversation: !!item.difyConversationId,
        lastActiveAt: item.lastActiveAt,
        lastRouteReason: item.lastRouteReason
      }));
  }

  private updateParkingLotRouting(
    parkingLot: ParkingLotState,
    input: {
      currentAgentKey: RouterAgentKey;
      nextAgentKey: RouterAgentKey;
      nextChatflowId: string;
      routeReason: string;
      inputType: string;
    }
  ): ParkingLotState {
    const now = new Date().toISOString();
    const currentModule = this.getModuleSessionState(parkingLot, input.nextAgentKey, input.nextChatflowId);

    return {
      ...parkingLot,
      moduleSessions: {
        ...(parkingLot.moduleSessions || {}),
        [input.nextAgentKey]: {
          ...currentModule,
          chatflowId: input.nextChatflowId,
          lastRouteReason: input.routeReason,
          lastActiveAt: currentModule.lastActiveAt || now
        }
      },
      routingContext: {
        currentModule: input.nextAgentKey,
        previousModule:
          input.currentAgentKey !== input.nextAgentKey
            ? input.currentAgentKey
            : parkingLot.routingContext?.previousModule,
        lastRouteReason: input.routeReason,
        lastInputType: input.inputType,
        updatedAt: now
      }
    };
  }

  private updateParkingLotAfterResponse(input: {
    parkingLot: ParkingLotState;
    currentAgentKey: RouterAgentKey;
    decision: RoutingDecision;
    input: StartRouterStreamInputDto;
    generated: {
      difyConversationId: string;
      providerMessageId: string;
    };
    handoff: RouterHandoff | null;
  }): ParkingLotState {
    const routed = this.updateParkingLotRouting(input.parkingLot, {
      currentAgentKey: input.currentAgentKey,
      nextAgentKey: input.decision.agentKey,
      nextChatflowId: input.decision.chatflowId,
      routeReason: input.decision.routeReason,
      inputType: input.input.inputType
    });
    const now = new Date().toISOString();
    const currentModule = this.getModuleSessionState(
      routed,
      input.decision.agentKey,
      input.decision.chatflowId
    );

    return {
      ...routed,
      moduleSessions: {
        ...(routed.moduleSessions || {}),
        [input.decision.agentKey]: {
          ...currentModule,
          chatflowId: input.decision.chatflowId,
          difyConversationId: input.generated.difyConversationId || currentModule.difyConversationId,
          providerMessageId: input.generated.providerMessageId || currentModule.providerMessageId,
          lastRouteReason: input.decision.routeReason,
          lastActiveAt: now,
          handoffSummary: input.handoff?.summary || currentModule.handoffSummary || ""
        }
      }
    };
  }

  private async buildHandoffContext(input: {
    userId: string;
    state: {
      id: string;
      agentKey: RouterAgentKey;
    };
    decision: RoutingDecision;
    userText: string;
    input: StartRouterStreamInputDto;
    moduleSession: ModuleSessionState;
  }): Promise<RouterHandoff | null> {
    const shouldInjectHandoff =
      input.decision.agentKey !== input.state.agentKey || !input.moduleSession.difyConversationId;

    if (!shouldInjectHandoff) {
      return null;
    }

    const summary = await this.buildHandoffSummary(input);
    if (!summary) {
      return null;
    }

    return {
      fromAgentKey: input.state.agentKey,
      toAgentKey: input.decision.agentKey,
      routeReason: input.decision.routeReason,
      summary,
      createdAt: new Date().toISOString()
    };
  }

  private async buildHandoffSummary(input: {
    userId: string;
    state: {
      id: string;
      agentKey: RouterAgentKey;
    };
    decision: RoutingDecision;
    userText: string;
    input: StartRouterStreamInputDto;
  }) {
    const recentMessages = await this.prisma.message.findMany({
      where: {
        userId: input.userId,
        conversationId: this.buildConversationId(input.state.id)
      },
      orderBy: {
        createdAt: "desc"
      },
      take: 4
    });

    const pieces: string[] = [];
    if (input.userText) {
      pieces.push(`Latest user intent: ${truncateText(input.userText, 220)}`);
    }

    if (recentMessages.length) {
      const lines = recentMessages.reverse().map((item) => {
        const speaker = item.role === MessageRole.USER ? "user" : `${item.agentKey || input.state.agentKey}_agent`;
        return `- ${speaker}: ${truncateText(item.text, 160)}`;
      });
      pieces.push(`Recent conversation:\n${lines.join("\n")}`);
    }

    if (!pieces.length && input.input.inputType === "quick_reply" && input.input.routeAction) {
      pieces.push(`由快捷回复动作触发: ${input.input.routeAction}`);
    }

    if (!pieces.length) {
      return "";
    }

    return truncateText(pieces.join("\n\n"), 1600);
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function truncateText(value: unknown, maxLength = 160) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text || text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, Math.max(0, maxLength - 1)).trim()}...`;
}

function isConversationNotExistsError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  return /conversation not exists/i.test(message);
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

