import {
  BadRequestException,
  Injectable,
  Logger,
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
import { DifySnapshotContextService } from "../dify-snapshot-context.service";
import { DifyService } from "../dify.service";
import { ProfileService } from "../profile.service";
import type { AssetWorkflowKey } from "../shared/app-config";
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
    assetWorkflowKey?: string;
  }>;
  firstScreenMessages: Array<Record<string, unknown>>;
  recentMessages: Array<Record<string, unknown>>;
  quickReplies: Array<Record<string, unknown>>;
  assetReportStatus: AssetReportStatus;
  reportVersion: string;
  lastReportAt: string;
  lastError: string;
  assetWorkflowKey: string;
};

type AssetReportStatus = "idle" | "pending" | "ready" | "failed";

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
  assetWorkflowKey: string;
};

type AssetChatWorkflowKey = Exclude<AssetWorkflowKey, "reportGeneration">;

type AssetFlowSnapshot = {
  conversationId: string;
  inventoryStage: string;
  reviewStage: string;
  profileSnapshot: string;
  dimensionReports: string;
  nextQuestion: string;
  changeSummary: string;
  reportBrief: string;
  finalReport: string;
  reportVersion: string;
  lastReportGeneratedAt: string;
  assetWorkflowKey: string;
  reportStatus: AssetReportStatus;
  reportError: string;
  isReview: boolean;
  updatedAt: string;
};

type ResolvedAssetWorkflow = {
  workflowKey: AssetChatWorkflowKey;
  apiKey: string;
  query: string;
  conversationId: string;
  inputs: Record<string, unknown>;
  flowState: AssetFlowSnapshot;
};

type AssetAnswerPatch = {
  displayText: string;
  flowPatch: Partial<AssetFlowSnapshot>;
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
  private readonly logger = new Logger(RouterService.name);
  private readonly config = getAppConfig();
  private readonly assetReportJobs = new Map<string, Promise<void>>();
  private readonly mockChatFlow: MockChatFlowModule | null = this.config.devMockDify
    ? loadRootModule<MockChatFlowModule>("services/mock-chat-flow.service.js")
    : null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly difyService: DifyService,
    private readonly difySnapshotContextService: DifySnapshotContextService,
    private readonly profileService: ProfileService
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

  async getAssetReportStatus(sessionId: string, user?: Record<string, unknown>) {
    const userId = this.resolveUserId(user);
    await this.findOwnedStateOrThrow(sessionId, userId);
    const status = await this.readAssetReportStatus(userId);
    return {
      assetWorkflowKey: status.assetWorkflowKey,
      inventoryStage: status.inventoryStage,
      reportStatus: status.reportStatus,
      reportVersion: status.reportVersion,
      lastReportAt: status.lastReportAt,
      lastError: status.lastError
    };
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
      handoff,
      moduleSession
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
      card: generated.card,
      cardType: decision.cardType,
      routeReason: decision.routeReason,
      assetReportStatus: generated.reportStatus
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
      assetReportStatus: generated.reportStatus || "idle",
      lastError: generated.reportError || "",
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
        throw new NotFoundException(`璺敱娴佷笉瀛樺湪: ${streamId}`);
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
      throw new NotFoundException(`璺敱浼氳瘽涓嶅瓨鍦? ${sessionId}`);
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
        label: `璺敱浼氳瘽-${agentKey}`,
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
    const assetReportStatus = await this.readAssetReportStatus(user.id);
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
      quickReplies: getQuickRepliesByAgent(state.agentKey),
      assetReportStatus: assetReportStatus.reportStatus,
      reportVersion: assetReportStatus.reportVersion,
      lastReportAt: assetReportStatus.lastReportAt,
      lastError: assetReportStatus.lastError,
      assetWorkflowKey: assetReportStatus.assetWorkflowKey
    };
  }

  private async readAssetReportStatus(userId: string) {
    const context = await this.profileService.getAssetInventoryFlowContext(userId);
    const flowState = this.normalizeAssetFlowSnapshot(context.flowState, context.updatedAt);
    const resolvedStatus = resolveAssetReportStatus(flowState);
    return {
      assetWorkflowKey: flowState.assetWorkflowKey,
      inventoryStage: flowState.inventoryStage,
      reportStatus: resolvedStatus,
      reportVersion: flowState.reportVersion,
      lastReportAt: flowState.lastReportGeneratedAt,
      lastError: flowState.reportError
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
      card?: Record<string, unknown>;
      cardType?: string;
      routeReason: string;
      assetReportStatus?: AssetReportStatus;
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
        assetReportStatus: payload.assetReportStatus || "idle",
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

    let emittedCardType = "";
    if (payload.card) {
      emittedCardType = normalizeText(payload.card.cardType || payload.cardType || "artifact_card");
      events.push({
        type: "card",
        streamId,
        cardType: emittedCardType,
        card: payload.card
      });
    }

    if (payload.cardType && payload.cardType !== emittedCardType) {
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
        description: "检查收入质量、现金流和可复用性。"
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
      },
      asset_report: {
        title: "资产盘点报告",
        description: "最新资产盘点报告已生成，可直接查看并继续推进。"
      }
    };

    const base = {
      ...defaultCard,
      ...(registry[cardType] || {})
    };

    if (cardType === "asset_report") {
      return {
        ...base,
        primaryText: "查看报告",
        primaryAction: "open_asset_report"
      };
    }

    return base;
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
    moduleSession: ModuleSessionState;
  }): Promise<{
    answer: string;
    difyConversationId: string;
    providerMessageId: string;
    assetWorkflowKey: string;
    reportStatus: AssetReportStatus;
    reportError: string;
    card?: Record<string, unknown>;
  }> {
    const fallbackQuery = this.buildModelQuery(
      input.agentKey,
      input.chatflowId,
      input.userText,
      input.memoryEntries,
      input.handoff
    );
    let query = fallbackQuery;
    let difyApiKey = this.resolveDifyApiKey(input.agentKey);
    let conversationId = input.difyConversationId || "";
    let inputs: Record<string, unknown> | undefined;
    let assetWorkflow: ResolvedAssetWorkflow | null = null;

    if (input.agentKey === "asset") {
      assetWorkflow = await this.resolveAssetWorkflow({
        userId: input.userId,
        userText: input.userText,
        handoff: input.handoff,
        memoryEntries: input.memoryEntries,
        moduleSession: input.moduleSession
      });
      query = assetWorkflow.query;
      difyApiKey = assetWorkflow.apiKey;
      conversationId = assetWorkflow.conversationId;
      inputs = assetWorkflow.inputs;
    }

    if (this.difyService.isEnabled(difyApiKey)) {
      try {
        if (!assetWorkflow) {
          const snapshotContext = await this.difySnapshotContextService.buildSnapshotInputs(input.userId, {
            channel: "router",
            agentKey: input.agentKey
          });
          inputs = snapshotContext.inputs;
        }

        const result = await this.sendModuleChatMessage({
          apiKey: difyApiKey,
          conversationId,
          query,
          userId: input.userId,
          inputs
        });

        const rawAnswer = String(result.answer || "").trim();
        let answer = stripInternalMarkers(rawAnswer) || "收到，我们继续往下梳理。";
        let card: Record<string, unknown> | undefined;
        let reportOutcome: { status: AssetReportStatus; finalReport: string; lastError: string } = {
          status: "idle",
          finalReport: "",
          lastError: ""
        };

        if (assetWorkflow && result.conversationId) {
          const patch = this.extractAssetAnswerPatch(rawAnswer, assetWorkflow.workflowKey);
          let stateFromAnswer: AssetFlowSnapshot | null = null;

          if (Object.keys(patch.flowPatch).length) {
            const merged = await this.profileService.updateAssetInventoryFromFlowState(input.userId, {
              conversationId: result.conversationId,
              inventoryStage: patch.flowPatch.inventoryStage,
              reviewStage: patch.flowPatch.reviewStage,
              profileSnapshot: patch.flowPatch.profileSnapshot,
              dimensionReports: patch.flowPatch.dimensionReports,
              nextQuestion: patch.flowPatch.nextQuestion,
              changeSummary: patch.flowPatch.changeSummary,
              reportBrief: patch.flowPatch.reportBrief,
              finalReport: patch.flowPatch.finalReport,
              assetWorkflowKey: assetWorkflow.workflowKey,
              isReview: assetWorkflow.workflowKey === "reviewUpdate" ? "true" : "false"
            });
            stateFromAnswer = this.normalizeAssetFlowSnapshot(merged.flowState, new Date().toISOString());
          }

          const syncedState = await this.syncAssetInventoryFromConversationVariables({
            userId: input.userId,
            conversationId: result.conversationId,
            apiKey: difyApiKey,
            assetWorkflowKey: assetWorkflow.workflowKey
          });

          const effectiveState = this.mergeAssetFlowSnapshots(assetWorkflow.flowState, stateFromAnswer, syncedState);

          if (patch.displayText) {
            answer = patch.displayText;
          }

          reportOutcome = await this.enqueueAssetReportIfReady({
            userId: input.userId,
            answer: rawAnswer,
            flowState: effectiveState,
            assetWorkflowKey: assetWorkflow.workflowKey
          });

          if (reportOutcome.status === "ready" && reportOutcome.finalReport) {
            answer =
              assetWorkflow.workflowKey === "reviewUpdate"
                ? "资产复盘报告已生成，我把变化和新版建议整理好了。"
                : "资产盘点报告已生成，我把四维资产和下一步建议整理好了。";
            card = this.buildAssetReportCard(reportOutcome.finalReport, effectiveState, assetWorkflow.workflowKey);
          } else if (reportOutcome.status === "pending") {
            answer =
              assetWorkflow.workflowKey === "reviewUpdate"
                ? "复盘信息已收齐，报告正在生成中，完成后我会第一时间提醒你。"
                : "资产盘点信息已收齐，报告正在生成中，完成后我会第一时间提醒你。";
          } else if (reportOutcome.status === "failed") {
            answer = "报告生成遇到问题了，我已经记录错误。你可以稍后重试，或继续补充信息后再生成。";
          }
        }

        return {
          answer,
          difyConversationId: result.conversationId || conversationId,
          providerMessageId: result.messageId || "",
          assetWorkflowKey: assetWorkflow?.workflowKey || "",
          reportStatus: reportOutcome?.status || "idle",
          reportError: reportOutcome?.lastError || "",
          ...(card ? { card } : {})
        };
      } catch (error) {
        if (!this.config.devMockDify) {
          throw new ServiceUnavailableException(
            error instanceof Error && error.message ? error.message : "Dify is unavailable"
          );
        }
      }
    }

    if (this.config.devMockDify && this.mockChatFlow) {
      const mockReply = this.mockChatFlow.getReplyByAgent(input.agentKey, input.userText || query);
      return {
        answer: String(mockReply.text || "").trim() || "收到，我们继续往下梳理。",
        difyConversationId: input.difyConversationId,
        providerMessageId: "",
        assetWorkflowKey: assetWorkflow?.workflowKey || "",
        reportStatus: "idle",
        reportError: ""
      };
    }

    throw new ServiceUnavailableException("Dify is unavailable");
  }
  private async syncAssetInventoryFromConversationVariables(input: {
    userId: string;
    conversationId: string;
    apiKey: string;
    assetWorkflowKey: AssetChatWorkflowKey;
  }) {
    try {
      const variables = await this.difyService.getConversationVariables(
        input.conversationId,
        input.userId,
        { apiKey: input.apiKey }
      );

      const relevant = this.extractAssetFlowStateFromVariables(
        variables,
        input.conversationId,
        input.assetWorkflowKey
      );

      const { conversationId: _conversationId, ...payload } = relevant;
      const hasPayload = Object.values(payload).some((value) => String(value || "").trim());
      if (!hasPayload) {
        return null;
      }

      const merged = await this.profileService.updateAssetInventoryFromFlowState(input.userId, {
        ...relevant,
        assetWorkflowKey: input.assetWorkflowKey,
        isReview: input.assetWorkflowKey === "reviewUpdate" ? "true" : "false"
      });

      return this.normalizeAssetFlowSnapshot(merged.flowState, new Date().toISOString());
    } catch (error) {
      this.logger.warn(
        `Failed to sync ASSET_INVENTORY from Dify conversation variables: ${error instanceof Error ? error.message : String(error || "unknown_error")}`
      );
      return null;
    }
  }

  private async resolveAssetWorkflow(input: {
    userId: string;
    userText: string;
    handoff: RouterHandoff | null;
    memoryEntries: Array<{ content: string; category: MemoryCategory }>;
    moduleSession: ModuleSessionState;
  }): Promise<ResolvedAssetWorkflow> {
    const context = await this.profileService.getAssetInventoryFlowContext(input.userId);
    const flowState = this.normalizeAssetFlowSnapshot(context.flowState, context.updatedAt);
    const workflowKey = this.pickAssetWorkflowKey(flowState);
    const previousWorkflowKey = normalizeAssetWorkflowKey(input.moduleSession.assetWorkflowKey);

    return {
      workflowKey,
      apiKey: this.config.difyAssetWorkflowApiKeys[workflowKey],
      query: this.buildAssetWorkflowQuery(input.userText, workflowKey),
      conversationId: previousWorkflowKey === workflowKey ? input.moduleSession.difyConversationId : "",
      inputs: this.buildAssetWorkflowInputs({
        workflowKey,
        flowState,
        handoff: input.handoff,
        memoryEntries: input.memoryEntries
      }),
      flowState
    };
  }

  private buildAssetWorkflowInputs(input: {
    workflowKey: AssetChatWorkflowKey;
    flowState: AssetFlowSnapshot;
    handoff: RouterHandoff | null;
    memoryEntries: Array<{ content: string; category: MemoryCategory }>;
  }) {
    switch (input.workflowKey) {
      case "reviewUpdate":
        return {
          old_profile_snapshot: input.flowState.profileSnapshot,
          old_dimension_reports: input.flowState.dimensionReports,
          last_report_date: input.flowState.lastReportGeneratedAt || input.flowState.updatedAt,
          review_version: String(resolveNextAssetReportVersion(input.flowState.reportVersion, true))
        };
      case "resumeInventory":
        return {
          prev_stage: input.flowState.inventoryStage || "opening",
          prev_profile_snapshot: input.flowState.profileSnapshot,
          prev_dimension_reports: input.flowState.dimensionReports,
          prev_next_question: input.flowState.nextQuestion
        };
      default:
        return {
          intake_summary: this.buildAssetIntakeSummary(input.handoff, input.memoryEntries)
        };
    }
  }

  private buildAssetIntakeSummary(
    handoff: RouterHandoff | null,
    memoryEntries: Array<{ content: string; category: MemoryCategory }>
  ) {
    const parts: string[] = [];

    if (handoff?.summary) {
      parts.push(handoff.summary);
    }

    if (memoryEntries.length) {
      const memory = memoryEntries
        .slice(0, 4)
        .map((entry) => `- [${entry.category}] ${truncateText(entry.content, 120)}`)
        .join("\n");
      parts.push(`宸茬煡鑳屾櫙锛歕n${memory}`);
    }

    return truncateText(parts.join("\n\n"), 2000);
  }

  private buildAssetWorkflowQuery(userText: string, workflowKey: AssetChatWorkflowKey) {
    const text = String(userText || "").trim();
    if (text && !/^\[(quick_reply|agent_switch|system_event)\]/.test(text)) {
      return text;
    }

    if (workflowKey === "reviewUpdate") {
      return "我想根据最近的新变化更新我的资产盘点。";
    }

    if (workflowKey === "resumeInventory") {
      return "我们继续上次没完成的资产盘点。";
    }

    return "我想开始盘点我的资产。";
  }
  private pickAssetWorkflowKey(flowState: AssetFlowSnapshot): AssetChatWorkflowKey {
    const hasCompletedReport =
      flowState.inventoryStage === "report_generated" ||
      !!flowState.finalReport ||
      !!flowState.lastReportGeneratedAt;

    if (hasCompletedReport && flowState.profileSnapshot && flowState.dimensionReports) {
      return "reviewUpdate";
    }

    const hasExistingProgress =
      !!flowState.conversationId ||
      !!flowState.profileSnapshot ||
      !!flowState.dimensionReports ||
      !!flowState.nextQuestion ||
      isInventoryInProgressStage(flowState.inventoryStage);

    if (hasExistingProgress) {
      return "resumeInventory";
    }

    return "firstInventory";
  }

  private normalizeAssetFlowSnapshot(flowState: unknown, updatedAt: string): AssetFlowSnapshot {
    const source = isRecord(flowState) ? flowState : {};

    return {
      conversationId: normalizeText(source.conversationId),
      inventoryStage: normalizeText(source.inventoryStage),
      reviewStage: normalizeText(source.reviewStage),
      profileSnapshot: normalizeText(source.profileSnapshot),
      dimensionReports: normalizeText(source.dimensionReports),
      nextQuestion: normalizeText(source.nextQuestion),
      changeSummary: normalizeText(source.changeSummary),
      reportBrief: normalizeText(source.reportBrief),
      finalReport: normalizeText(source.finalReport),
      reportVersion: normalizeText(source.reportVersion),
      lastReportGeneratedAt: normalizeText(source.lastReportGeneratedAt),
      assetWorkflowKey: normalizeText(source.assetWorkflowKey),
      reportStatus: normalizeAssetReportStatus(source.reportStatus),
      reportError: normalizeText(source.reportError),
      isReview: normalizeBooleanLike(source.isReview),
      updatedAt
    };
  }

  private extractAssetFlowStateFromVariables(
    variables: Record<string, unknown>,
    conversationId: string,
    assetWorkflowKey: AssetChatWorkflowKey
  ) {
    if (assetWorkflowKey === "reviewUpdate") {
      const reviewStage = normalizeText(variables.review_stage);
      const finalReport = normalizeText(variables.final_report);

      return {
        conversationId,
        inventoryStage: normalizeReviewStage(reviewStage),
        reviewStage,
        profileSnapshot: variables.updated_profile_snapshot,
        dimensionReports: variables.updated_dimension_reports,
        nextQuestion: variables.next_question,
        changeSummary: variables.change_summary,
        reportBrief: variables.report_brief,
        ...(finalReport ? { finalReport } : {})
      };
    }

    const finalReport = normalizeText(variables.final_report);

    return {
      conversationId,
      inventoryStage: variables.inventory_stage,
      reviewStage: "",
      profileSnapshot: variables.profile_snapshot,
      dimensionReports: variables.dimension_reports,
      nextQuestion: variables.next_question,
      changeSummary: "",
      reportBrief: variables.report_brief,
      ...(finalReport ? { finalReport } : {})
    };
  }

  private async enqueueAssetReportIfReady(input: {
    userId: string;
    answer: string;
    flowState: AssetFlowSnapshot | null;
    assetWorkflowKey: AssetChatWorkflowKey;
  }): Promise<{ status: AssetReportStatus; finalReport: string; lastError: string }> {
    if (!input.flowState) {
      return {
        status: "idle",
        finalReport: "",
        lastError: ""
      };
    }

    const readyByMarker = /\[(INVENTORY_COMPLETE|REVIEW_COMPLETE)\]/.test(input.answer);
    const readyByStage = input.flowState.inventoryStage === "ready_for_report";
    if (!readyByMarker && !readyByStage) {
      return {
        status: resolveAssetReportStatus(input.flowState),
        finalReport: "",
        lastError: input.flowState.reportError
      };
    }

    if (!input.flowState.profileSnapshot || !input.flowState.dimensionReports || !input.flowState.reportBrief) {
      const reason = "missing_report_inputs";
      await this.profileService.updateAssetInventoryFromFlowState(input.userId, {
        conversationId: input.flowState.conversationId,
        inventoryStage: input.flowState.inventoryStage,
        reviewStage: input.flowState.reviewStage,
        profileSnapshot: input.flowState.profileSnapshot,
        dimensionReports: input.flowState.dimensionReports,
        nextQuestion: input.flowState.nextQuestion,
        changeSummary: input.flowState.changeSummary,
        reportBrief: input.flowState.reportBrief,
        reportStatus: "failed",
        reportError: reason,
        assetWorkflowKey: input.assetWorkflowKey,
        isReview: input.assetWorkflowKey === "reviewUpdate" ? "true" : "false"
      });
      return {
        status: "failed",
        finalReport: "",
        lastError: reason
      };
    }

    const jobKey = `${input.userId}:${input.assetWorkflowKey}:${input.flowState.conversationId || "default"}`;
    if (this.assetReportJobs.has(jobKey)) {
      return {
        status: "pending",
        finalReport: "",
        lastError: ""
      };
    }

    await this.profileService.updateAssetInventoryFromFlowState(input.userId, {
      conversationId: input.flowState.conversationId,
      inventoryStage: input.flowState.inventoryStage,
      reviewStage: input.flowState.reviewStage,
      profileSnapshot: input.flowState.profileSnapshot,
      dimensionReports: input.flowState.dimensionReports,
      nextQuestion: input.flowState.nextQuestion,
      changeSummary: input.flowState.changeSummary,
      reportBrief: input.flowState.reportBrief,
      reportStatus: "pending",
      reportError: "",
      assetWorkflowKey: input.assetWorkflowKey,
      isReview: input.assetWorkflowKey === "reviewUpdate" ? "true" : "false"
    });

    const job = this.runAssetReportGenerationJob({
      userId: input.userId,
      flowState: input.flowState,
      assetWorkflowKey: input.assetWorkflowKey
    }).finally(() => {
      this.assetReportJobs.delete(jobKey);
    });
    this.assetReportJobs.set(jobKey, job);

    return {
      status: "pending",
      finalReport: "",
      lastError: ""
    };
  }

  private async runAssetReportGenerationJob(input: {
    userId: string;
    flowState: AssetFlowSnapshot;
    assetWorkflowKey: AssetChatWorkflowKey;
  }) {
    try {
      const nextVersion = resolveNextAssetReportVersion(
        input.flowState.reportVersion,
        input.assetWorkflowKey === "reviewUpdate"
      );
      const result = await this.difyService.runWorkflow(
        {
          user: input.userId,
          inputs: {
            profile_snapshot: input.flowState.profileSnapshot,
            dimension_reports: input.flowState.dimensionReports,
            report_brief: input.flowState.reportBrief,
            change_summary: input.flowState.changeSummary,
            report_version: String(nextVersion),
            is_review: input.assetWorkflowKey === "reviewUpdate" ? "true" : "false"
          }
        },
        {
          apiKey: this.config.difyAssetWorkflowApiKeys.reportGeneration
        }
      );

      const finalReport = stripInternalMarkers(normalizeText(result.outputs.final_report));
      if (!finalReport) {
        throw new Error("empty_final_report");
      }

      await this.profileService.updateAssetInventoryFromFlowState(input.userId, {
        conversationId: input.flowState.conversationId,
        inventoryStage: "report_generated",
        reviewStage: input.flowState.reviewStage,
        profileSnapshot: input.flowState.profileSnapshot,
        dimensionReports: input.flowState.dimensionReports,
        nextQuestion: "",
        changeSummary: input.flowState.changeSummary,
        reportBrief: input.flowState.reportBrief,
        finalReport,
        reportVersion: String(nextVersion),
        lastReportGeneratedAt: new Date().toISOString(),
        reportStatus: "ready",
        reportError: "",
        assetWorkflowKey: input.assetWorkflowKey,
        isReview: input.assetWorkflowKey === "reviewUpdate" ? "true" : "false"
      });
    } catch (error) {
      const lastError = error instanceof Error ? error.message : String(error || "unknown_error");
      this.logger.warn(`Asset report generation failed for user ${input.userId}: ${lastError}`);
      await this.profileService.updateAssetInventoryFromFlowState(input.userId, {
        conversationId: input.flowState.conversationId,
        inventoryStage: input.flowState.inventoryStage,
        reviewStage: input.flowState.reviewStage,
        profileSnapshot: input.flowState.profileSnapshot,
        dimensionReports: input.flowState.dimensionReports,
        nextQuestion: input.flowState.nextQuestion,
        changeSummary: input.flowState.changeSummary,
        reportBrief: input.flowState.reportBrief,
        reportStatus: "failed",
        reportError: lastError,
        assetWorkflowKey: input.assetWorkflowKey,
        isReview: input.assetWorkflowKey === "reviewUpdate" ? "true" : "false"
      });
    }
  }

  private async sendModuleChatMessage(input: {
    apiKey: string;
    conversationId: string;
    query: string;
    userId: string;
    inputs?: Record<string, unknown>;
  }) {
    return this.difyService.sendChatMessageWithContext(
      {
        query: input.query,
        user: input.userId,
        conversationId: input.conversationId || undefined,
        inputs: input.inputs
      },
      {
        apiKey: input.apiKey
      }
    );
  }

  private buildAssetReportCard(
    finalReport: string,
    flowState: AssetFlowSnapshot | null,
    workflowKey: AssetChatWorkflowKey
  ) {
    const version = Number.parseInt(String(flowState?.reportVersion || "").trim(), 10);
    const tags = [
      workflowKey === "reviewUpdate" ? "复盘更新" : "首次盘点",
      Number.isFinite(version) && version > 0 ? `V${version}` : ""
    ].filter(Boolean);

    return {
      cardType: "asset_report",
      title: workflowKey === "reviewUpdate" ? "资产复盘报告已生成" : "资产盘点报告已生成",
      description: finalReport,
      primaryText: "查看报告",
      secondaryText: "稍后",
      primaryAction: "open_asset_report",
      tags
    };
  }

  private mergeAssetFlowSnapshots(...states: Array<AssetFlowSnapshot | null | undefined>) {
    const available = states.filter((item): item is AssetFlowSnapshot => !!item);
    if (!available.length) {
      return null;
    }

    const merged = { ...available[0] };
    available.slice(1).forEach((state) => {
      if (state.conversationId) merged.conversationId = state.conversationId;
      if (state.inventoryStage) merged.inventoryStage = state.inventoryStage;
      if (state.reviewStage) merged.reviewStage = state.reviewStage;
      if (state.profileSnapshot) merged.profileSnapshot = state.profileSnapshot;
      if (state.dimensionReports) merged.dimensionReports = state.dimensionReports;
      if (state.nextQuestion) merged.nextQuestion = state.nextQuestion;
      if (state.changeSummary) merged.changeSummary = state.changeSummary;
      if (state.reportBrief) merged.reportBrief = state.reportBrief;
      if (state.finalReport) merged.finalReport = state.finalReport;
      if (state.reportVersion) merged.reportVersion = state.reportVersion;
      if (state.lastReportGeneratedAt) merged.lastReportGeneratedAt = state.lastReportGeneratedAt;
      if (state.assetWorkflowKey) merged.assetWorkflowKey = state.assetWorkflowKey;
      if (state.reportStatus) merged.reportStatus = state.reportStatus;
      if (state.reportError) merged.reportError = state.reportError;
      merged.isReview = state.isReview || merged.isReview;
      if (state.updatedAt) merged.updatedAt = state.updatedAt;
    });

    return merged;
  }

  private extractAssetAnswerPatch(answer: string, workflowKey: AssetChatWorkflowKey): AssetAnswerPatch {
    const source = String(answer || "").trim();
    if (!source) {
      return {
        displayText: "",
        flowPatch: {}
      };
    }

    const payload = this.tryParseJsonObject(source);
    if (!payload) {
      return {
        displayText: "",
        flowPatch: {}
      };
    }

    const stage = normalizeText(payload.stage || payload.inventory_stage || payload.inventoryStage);
    const reviewStage = normalizeText(payload.review_stage || payload.reviewStage);
    const followupMessage = normalizeText(payload.followup_message || payload.followupMessage || payload.message);
    const nextQuestion = normalizeText(payload.next_question || payload.nextQuestion);

    const displayParts = [followupMessage];
    if (nextQuestion && !followupMessage.includes(nextQuestion)) {
      displayParts.push(nextQuestion);
    }

    return {
      displayText: stripInternalMarkers(displayParts.filter(Boolean).join("\n").trim()),
      flowPatch: {
        inventoryStage:
          workflowKey === "reviewUpdate"
            ? normalizeReviewStage(stage || reviewStage)
            : stage,
        reviewStage,
        profileSnapshot: normalizeText(payload.profile_snapshot || payload.profileSnapshot),
        dimensionReports: normalizeText(payload.dimension_reports || payload.dimensionReports),
        nextQuestion,
        changeSummary: normalizeText(payload.change_summary || payload.changeSummary),
        reportBrief: normalizeText(payload.report_brief || payload.reportBrief),
        finalReport: normalizeText(payload.final_report || payload.finalReport)
      }
    };
  }

  private tryParseJsonObject(source: string): Record<string, unknown> | null {
    const text = String(source || "").trim();
    if (!text) {
      return null;
    }

    const clean = text.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
    const direct = safeJsonParse(clean);
    if (direct) {
      return direct;
    }

    const firstBrace = clean.indexOf("{");
    const lastBrace = clean.lastIndexOf("}");
    if (firstBrace < 0 || lastBrace <= firstBrace) {
      return null;
    }

    return safeJsonParse(clean.slice(firstBrace, lastBrace + 1));
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
          handoffSummary: "",
          assetWorkflowKey: ""
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
        handoffSummary: typeof entry.handoffSummary === "string" ? entry.handoffSummary : "",
        assetWorkflowKey: typeof entry.assetWorkflowKey === "string" ? entry.assetWorkflowKey : ""
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
      handoffSummary: existing?.handoffSummary || "",
      assetWorkflowKey: existing?.assetWorkflowKey || ""
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
        lastRouteReason: item.lastRouteReason,
        ...(item.assetWorkflowKey ? { assetWorkflowKey: item.assetWorkflowKey } : {})
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
      assetWorkflowKey?: string;
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
          handoffSummary: input.handoff?.summary || currentModule.handoffSummary || "",
          assetWorkflowKey: input.generated.assetWorkflowKey || currentModule.assetWorkflowKey || ""
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
      pieces.push(`鐢卞揩鎹峰洖澶嶅姩浣滆Е鍙? ${input.input.routeAction}`);
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

function normalizeText(value: unknown) {
  return String(value || "").trim();
}

function normalizeBooleanLike(value: unknown) {
  return String(value || "").trim().toLowerCase() === "true";
}

function normalizeAssetReportStatus(value: unknown): AssetReportStatus {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "pending" || normalized === "ready" || normalized === "failed") {
    return normalized;
  }
  return "idle";
}

function resolveAssetReportStatus(flowState: AssetFlowSnapshot): AssetReportStatus {
  if (flowState.reportStatus && flowState.reportStatus !== "idle") {
    return flowState.reportStatus;
  }
  if (flowState.reportError) {
    return "failed";
  }
  if (flowState.finalReport || flowState.inventoryStage === "report_generated") {
    return "ready";
  }
  return "idle";
}

function stripInternalMarkers(value: string) {
  return String(value || "")
    .replace(/\[(INVENTORY_COMPLETE|REVIEW_COMPLETE)\]/g, "")
    .trim();
}

function normalizeReviewStage(reviewStage: string) {
  const stageMap: Record<string, string> = {
    scanning: "opening",
    updating_ability: "ability",
    updating_resource: "resource",
    updating_cognition: "cognition",
    updating_relationship: "relationship",
    ready_for_report: "ready_for_report",
    no_change: "report_generated"
  };

  return stageMap[reviewStage] || reviewStage;
}

function isInventoryInProgressStage(stage: string) {
  return [
    "opening",
    "ability",
    "resource",
    "cognition",
    "relationship",
    "correction_loop",
    "ready_for_report"
  ].includes(String(stage || "").trim());
}

function resolveNextAssetReportVersion(currentVersion: string, isReview: boolean) {
  const parsed = Number.parseInt(String(currentVersion || "").trim(), 10);
  if (Number.isFinite(parsed) && parsed > 0) {
    return isReview ? parsed + 1 : parsed;
  }

  return isReview ? 2 : 1;
}

function normalizeAssetWorkflowKey(value: unknown): AssetChatWorkflowKey | undefined {
  const normalized = String(value || "").trim();
  if (normalized === "firstInventory" || normalized === "resumeInventory" || normalized === "reviewUpdate") {
    return normalized;
  }
  return undefined;
}

function safeJsonParse(source: string): Record<string, unknown> | null {
  if (!source) {
    return null;
  }

  try {
    const parsed = JSON.parse(source);
    if (isRecord(parsed)) {
      return parsed;
    }
    return null;
  } catch (_error) {
    return null;
  }
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



