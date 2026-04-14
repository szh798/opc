import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException
} from "@nestjs/common";
import {
  BehaviorEventType,
  MessageRole,
  Prisma,
  RouterAgentKey,
  RouterMode,
  RouterSessionStatus,
  User,
  UserFact,
  UserFactCategory
} from "@prisma/client";
import { randomUUID } from "node:crypto";
import { DifySnapshotContextService } from "../dify-snapshot-context.service";
import { DifyService } from "../dify.service";
import { ChatflowSummaryService } from "../memory/chatflow-summary.service";
import { MemoryExtractionService } from "../memory/memory-extraction.service";
import { SessionWindowService } from "../memory/session-window.service";
import { buildConversationLabelFromText, buildRouterConversationLabel } from "../shared/text-normalizer";
import { PolicyOpportunityService } from "../policy/policy-opportunity.service";
import type { PolicyMatchState } from "../policy/policy.types";
import { ProfileService } from "../profile.service";
import { UserService } from "../user.service";
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

// Phase 1.3 —— 5-首登兜底对话流 的 chatflow sentinel（不属于 5 个 agent，仅作为 routing marker）
// Phase 1.3 —— L1 UserFact 11 类 → Layer B 中文标签映射
// 对齐 abundant-forging-papert.md §3.1 + memory-extraction.prompt.ts
const USER_FACT_CATEGORY_LABELS: Record<UserFactCategory, string> = {
  skill: "能力",
  resource: "资源",
  cognition: "认知",
  relationship: "关系",
  experience: "经历",
  personality: "性格",
  preference: "偏好",
  pain_point: "痛点",
  goal: "目标",
  business: "商业",
  behavior: "行为"
};

// 每个 agent 关注的 L1 category 白名单（按相关性排序，查询时 take 限制数量）
const USER_FACT_CATEGORIES_BY_AGENT: Record<RouterAgentKey, UserFactCategory[]> = {
  asset: ["skill", "resource", "cognition", "relationship", "experience"],
  execution: ["goal", "business", "behavior", "resource"],
  mindset: ["pain_point", "personality", "behavior"],
  steward: ["business", "resource", "preference"],
  master: ["preference", "goal", "business", "personality"]
};

const ONBOARDING_FALLBACK_CHATFLOW_ID = "cf_onboarding_fallback";
const ONBOARDING_FALLBACK_MARKERS = {
  toInventory: "[HANDOFF_TO_ASSET_INVENTORY]",
  toPark: "[HANDOFF_TO_PARK]",
  stay: "[STAY_IN_FALLBACK]"
} as const;

// Phase 2·2 —— 6-闲聊收集流（info_collection_chat_flow）sentinel
// 用户在资产盘点中多次拒绝 → 资产盘点流输出 [USER_REFUSED_INVENTORY] → 后端切换到该 chatflow
// 该 chatflow 通过自然聊天收集 L1 事实，时机成熟再用 [GOTO_ASSET_INVENTORY]/[GOTO_PARK]/[GOTO_EXECUTION] 等把用户交还给主路由。
const INFO_COLLECTION_CHATFLOW_ID = "cf_info_collection";
const ASSET_USER_REFUSED_MARKER = "[USER_REFUSED_INVENTORY]";
const INFO_COLLECTION_GOTO_MARKERS = {
  toAsset: "[GOTO_ASSET_INVENTORY]",
  toPark: "[GOTO_PARK]",
  toExecution: "[GOTO_EXECUTION]",
  toMindset: "[GOTO_MINDSET]",
  stay: "[STAY_IN_FREE_CHAT]"
} as const;

// Phase 2·3 —— 7-生意体检流（business_health_check_flow）sentinel
// 触发：资产盘点流输出 [FORK_TO_BUSINESS_HEALTH]（用户披露已有在做的生意） 或 route_scale 主动入口。
// 出口：[BUSINESS_HEALTH_COMPLETE] / [GOTO_EXECUTION] / [GOTO_MINDSET] / [STAY_IN_BUSINESS_HEALTH]
// 园区反导：[RESIST_PARK_REDIRECT] —— 用户在体检过程中突然问园区/政策时，LLM 已被 prompt 指示
// 在 followup_message 里简短回应后把话题拉回生意体检本身，后端禁止这轮把用户真路由到 park_match_flow。
const BUSINESS_HEALTH_CHATFLOW_ID = "cf_business_health";
const ASSET_FORK_TO_BUSINESS_HEALTH_MARKER = "[FORK_TO_BUSINESS_HEALTH]";
const BUSINESS_HEALTH_MARKERS = {
  complete: "[BUSINESS_HEALTH_COMPLETE]",
  toExecution: "[GOTO_EXECUTION]",
  toMindset: "[GOTO_MINDSET]",
  resistPark: "[RESIST_PARK_REDIRECT]",
  stay: "[STAY_IN_BUSINESS_HEALTH]"
} as const;

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
  policyMatch?: PolicyMatchState;
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
  // streamId → { sessionId, controller }。用户点停止 / 下一轮新请求到达时,通过 abort
  // 把后台 runStreamingWorker 正在跑的 Dify SSE 连接就地断掉,避免"旁白继续写入"
  // 污染下一轮。keyed by streamId 方便 cancel 接口直接找,同时记录 sessionId 以便
  // startStream 入口按 session 批量 abort 残留 worker。
  private readonly streamAbortControllers = new Map<
    string,
    { sessionId: string; controller: AbortController }
  >();
  private readonly mockChatFlow: MockChatFlowModule | null = this.config.devMockDify
    ? loadRootModule<MockChatFlowModule>("services/mock-chat-flow.service.js")
    : null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly difyService: DifyService,
    private readonly difySnapshotContextService: DifySnapshotContextService,
    private readonly policyOpportunityService: PolicyOpportunityService,
    private readonly profileService: ProfileService,
    private readonly userService: UserService,
    private readonly memoryExtractionService: MemoryExtractionService,
    private readonly sessionWindowService: SessionWindowService,
    private readonly chatflowSummaryService: ChatflowSummaryService
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
    // 新一轮请求到来时,把这个 session 上还在跑的后台 worker 全部先 abort 掉,
    // 避免旧 worker 跑完后 finalize 把 conversationState 覆盖成过时的 agent/parkingLot
    // (前端可能已经停掉上一轮,或者直接连着发了下一条,都会走到这里)。
    this.abortInFlightStreamsForSession(sessionId);
    const state = await this.findOwnedStateOrThrow(sessionId, userId);
    const conversationId = await this.ensureConversationBridge(state.id, userId, state.agentKey);
    const parkingLot = this.parseParkingLot(state.parkingLot);
    const decision = await this.resolveRoutingDecision(state, input, userRecord, parkingLot);
    const userText = this.normalizeInputText(input);
    const moduleSession = this.getModuleSessionState(parkingLot, decision.agentKey, decision.chatflowId);
    const shouldHandlePolicyTurn = this.policyOpportunityService.shouldHandlePolicyTurn({
      routeReason: decision.routeReason,
      routeAction: input.routeAction,
      text: userText,
      policyMatch: parkingLot.policyMatch
    });

    // 真·流式路径：非 policy / 非 asset / 非特殊 chatflow 且 Dify 可用时，
    // 立刻返回 streamId,后台 worker 拉 Dify SSE、逐 chunk 写 streamEvent,
    // 前端通过 getStream 轮询即可在 first token 到达的瞬间开始渲染,省掉 Dify
    // blocking 的整段墙上时间。Asset / onboarding / info / business_health 的
    // 后处理依赖完整答案,仍走下面的 blocking 兼容路径。
    if (!shouldHandlePolicyTurn && this.isStreamingEligible(decision)) {
      return this.beginStreamingReply({
        state,
        decision,
        input,
        userText,
        userId,
        moduleSession,
        parkingLot,
        conversationId
      });
    }

    let handoff: RouterHandoff | null = null;
    let policyMatchPatch: PolicyMatchState | null | undefined;
    const generated = shouldHandlePolicyTurn
      ? await (async () => {
          const policyResult = await this.policyOpportunityService.handlePolicyTurn({
            parkingLot: {
              policyMatch: parkingLot.policyMatch
            },
            input: {
              inputType: input.inputType,
              text: userText,
              routeAction: input.routeAction,
              metadata: isRecord(input.metadata) ? input.metadata : {}
            },
            userId,
            routeReason: decision.routeReason
          });
          policyMatchPatch = policyResult.policyMatch;
          return {
            answer: policyResult.answer || "我在，继续说。",
            nextQuestion: policyResult.nextQuestion || "",
            difyConversationId: moduleSession.difyConversationId || "",
            providerMessageId: "",
            assetWorkflowKey: moduleSession.assetWorkflowKey || "",
            reportStatus: "idle" as AssetReportStatus,
            reportError: "",
            ...(policyResult.card ? { card: policyResult.card as Record<string, unknown> } : {})
          };
        })()
      : await (async () => {
          handoff = await this.buildHandoffContext({
            userId,
            state,
            decision,
            userText,
            input,
            moduleSession
          });

          const [sessionEntries, facts, summaries] = await Promise.all([
            this.sessionWindowService.fetchRecent(userId),
            this.fetchUserFactsForAgent(userId, decision.agentKey),
            this.chatflowSummaryService.fetchLayerCSummaries(userId)
          ]);
          const layerA = this.sessionWindowService.formatAsLayerA(sessionEntries);
          const layerB = this.formatFactsAsLayerB(facts);
          const layerC = this.chatflowSummaryService.formatAsLayerC(summaries);
          const memoryBlock = [layerA, layerB, layerC].filter((section) => section && section.trim()).join("\n\n");

          return this.generateAssistantReply({
            userId,
            agentKey: decision.agentKey,
            chatflowId: decision.chatflowId,
            userText,
            difyConversationId: moduleSession.difyConversationId || "",
            memoryBlock,
            handoff,
            moduleSession
          });
        })();
    let nextParkingLot = this.updateParkingLotAfterResponse({
      parkingLot,
      currentAgentKey: state.agentKey,
      decision,
      input,
      generated,
      handoff
    });
    if (typeof policyMatchPatch !== "undefined") {
      nextParkingLot = {
        ...nextParkingLot,
        policyMatch: policyMatchPatch || undefined
      };
    }
    // 用户点了"好的/聊点其他的"，或任何路由明确离场政策流的动作：清掉 policyMatch，
    // 下一轮 buildSessionSnapshot 就会回到各 agent 的默认快捷回复，而不是继续停留在
    // 薅羊毛分支点 / 槽位收集态。
    if (
      this.policyOpportunityService.isPolicyExitToOtherFlow(input.routeAction) ||
      (parkingLot.policyMatch &&
        this.policyOpportunityService.isAtPolicyBranchDecision(parkingLot.policyMatch) &&
        input.inputType === "text")
    ) {
      nextParkingLot = {
        ...nextParkingLot,
        policyMatch: undefined
      };
    }

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
      assetReportStatus: generated.reportStatus,
      nextQuestion: (generated as any).nextQuestion || ""
    } as any);

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

        if (input.inputType === "text") {
          const nextLabel = buildConversationLabelFromText(userText);
          await tx.conversation.updateMany({
            where: {
              id: conversationId,
              label: {
                startsWith: "路由会话-"
              }
            },
            data: {
              label: nextLabel,
              lastMessageAt: new Date()
            }
          });
        }
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

    // Phase 1.4 —— 写入 60 分钟会话窗口（Layer A 的数据源，fire-and-forget）
    // 同一轮的 user + assistant 都要入窗，下一轮才能看到完整上下文。
    // 纯 agent_switch / system_event 也入窗但标记为 system 角色,便于摘要时识别。
    const windowUserRole = input.inputType === "text" ? "user" : "system";
    if (userText) {
      this.sessionWindowService.appendAsync(userId, {
        role: windowUserRole,
        content: userText,
        agentKey: decision.agentKey,
        chatflowId: decision.chatflowId
      });
    }
    if (generated.answer) {
      this.sessionWindowService.appendAsync(userId, {
        role: "assistant",
        content: generated.answer,
        agentKey: decision.agentKey,
        chatflowId: decision.chatflowId
      });
    }

    // Phase 1.2 —— L1 事实抽取（fire-and-forget，不阻塞 stream 返回）
    // 只有当用户本轮确实说了点什么时才触发，纯快捷回复/system_event 不抽
    const extractableUserText = this.extractableUserText(input, userText);
    if (extractableUserText) {
      this.memoryExtractionService.extractAsync(userId, {
        userText: extractableUserText,
        assistantText: generated.answer || "",
        agentKey: decision.agentKey,
        chatflowId: decision.chatflowId
      });
    }

    // Phase 1.5 —— chatflow 完成触发摘要写入（fire-and-forget,级联触发 L3 画像重算）
    //   agent_switch：上一个 agent 的会话事实上结束 → 摘要上一个 agent 的窗口
    //   status 切到 completed：当前会话显式完成 → 摘要当前 agent 的窗口
    const previousAgentKey = state.agentKey;
    const agentChanged = previousAgentKey !== decision.agentKey;
    const isExplicitSwitch = input.inputType === "agent_switch";
    if (agentChanged || isExplicitSwitch) {
      this.chatflowSummaryService.summarizeAsync(userId, {
        agentKey: previousAgentKey,
        chatflowId: state.chatflowId,
        trigger: "agent_switch"
      });
    }
    const nextStatus = this.deriveSessionStatus(input, userText);
    if (nextStatus === "completed" && state.status !== "completed") {
      this.chatflowSummaryService.summarizeAsync(userId, {
        agentKey: decision.agentKey,
        chatflowId: decision.chatflowId,
        trigger: "session_completed"
      });
    }

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
      status: "streaming",
      // 本地生成的回答（比如 policy 槽位流）所有 events 在事务里已经算好；
      // 随响应直接返回，前端就不用再跑一次 pollStreamEvents 的额外 HTTP 往返，
      // 避免短回复被 120ms 轮询 + 额外请求拖出肉眼可见的"处理中"延迟。
      events
    };
  }

  /**
   * Phase 1.2 —— 只有真实用户文字才值得送去抽取 L1 事实。
   * 过滤纯快捷回复、agent 切换、system 事件等无人类语义的输入。
   */
  private extractableUserText(input: StartRouterStreamInputDto, normalized: string): string {
    if (input?.inputType !== "text") return "";
    const text = String(normalized || "").trim();
    if (!text) return "";
    if (/^\[(quick_reply|agent_switch|system_event)\b/i.test(text)) return "";
    // 太短的输入通常信息密度不够（"嗯" / "好" / "？"）
    if (text.length < 4) return "";
    return text;
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
    const facts = await this.fetchUserFactsForAgent(userId, state.agentKey);
    const memoryBlock = this.formatFactsAsLayerB(facts);
    return {
      sessionId: state.id,
      agentKey: state.agentKey,
      count: facts.length,
      memoryBlock,
      // UserFact.id 是 BigInt，序列化到 JSON 必须先 toString，否则 Fastify 报错
      entries: facts.map((fact) => ({
        id: fact.id.toString(),
        category: fact.category,
        dimension: fact.dimension,
        factKey: fact.factKey,
        factValue: fact.factValue,
        confidence: fact.confidence,
        version: fact.version,
        updatedAt: fact.updatedAt
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
        label: buildRouterConversationLabel(agentKey),
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
      quickReplies: this.resolveQuickRepliesForState(state.agentKey, parkingLot),
      assetReportStatus: assetReportStatus.reportStatus,
      reportVersion: assetReportStatus.reportVersion,
      lastReportAt: assetReportStatus.lastReportAt,
      lastError: assetReportStatus.lastError,
      assetWorkflowKey: assetReportStatus.assetWorkflowKey
    };
  }

  // 根据 policyMatch 状态动态决定下发给前端的快捷回复：
  //   1) 用户正处于薅羊毛政策槽位收集流（ask_*）→ 清空快捷回复，避免 steward 默认的
  //      "做商业体检 / 匹配合适园区 / 切回主对话"继续闪在对话框上干扰用户。
  //   2) 用户刚答完公司状态、进到 branch_asset_audit 分支点 → 下发两颗硬编码的
  //      "好的 / 聊点其他的"，对应 route action：policy_to_asset_audit / policy_keep_chatting。
  //   3) 其它情况仍然走各 agent 的默认快捷回复。
  private resolveQuickRepliesForState(
    agentKey: RouterAgentKey,
    parkingLot: ParkingLotState
  ): Array<Record<string, unknown>> {
    const policyMatch = parkingLot.policyMatch;
    if (this.policyOpportunityService.isAtPolicyBranchDecision(policyMatch)) {
      return [
        {
          quickReplyId: "qr-policy-to-asset-audit",
          label: "好的",
          routeAction: "policy_to_asset_audit"
        },
        {
          quickReplyId: "qr-policy-keep-chatting",
          label: "聊点其他的",
          routeAction: "policy_keep_chatting"
        }
      ];
    }
    if (this.policyOpportunityService.isPolicyFlowActive(policyMatch)) {
      return [];
    }
    return getQuickRepliesByAgent(agentKey);
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

  /**
   * 判断这一轮是否可以走真流式。asset / onboarding_fallback / info_collection /
   * business_health 都有"拿到完整答案再做后处理"的逻辑（抽字段、改写、生成卡片），
   * 硬拆成本太高也容易把流切掉,所以先只让默认 agent 聊天走流式,其它路径继续 blocking。
   */
  private isStreamingEligible(decision: RoutingDecision): boolean {
    if (decision.agentKey === "asset") return false;
    if (
      decision.chatflowId === ONBOARDING_FALLBACK_CHATFLOW_ID ||
      decision.chatflowId === INFO_COLLECTION_CHATFLOW_ID ||
      decision.chatflowId === BUSINESS_HEALTH_CHATFLOW_ID
    ) {
      return false;
    }
    const apiKey = this.resolveDifyApiKey(decision.agentKey);
    return this.difyService.isEnabled(apiKey);
  }

  /**
   * 流式入口:写完 user message + meta event + session 状态后立刻返回 streamId,
   * 把剩下的 Dify 调用 / token 写入 / parkingLot finalize 全部丢进后台 worker。
   * 前端立刻开始 pollStream → first token 一到就能渲染,不再等 blocking 墙上时间。
   */
  private async beginStreamingReply(ctx: {
    state: {
      id: string;
      agentKey: RouterAgentKey;
      chatflowId: string;
      status: RouterSessionStatus;
      difyConversationId: string | null;
    };
    decision: RoutingDecision;
    input: StartRouterStreamInputDto;
    userText: string;
    userId: string;
    moduleSession: ModuleSessionState;
    parkingLot: ParkingLotState;
    conversationId: string;
  }) {
    const streamId = `router-stream-${randomUUID()}`;
    const metaEvent = {
      type: "meta",
      streamId,
      sessionId: ctx.state.id,
      agentKey: ctx.decision.agentKey,
      routeMode: ctx.decision.mode,
      chatflowId: ctx.decision.chatflowId,
      routeReason: ctx.decision.routeReason,
      assetReportStatus: "idle" as AssetReportStatus,
      nextQuestion: "",
      createdAt: Date.now()
    };

    // 前置 tx:尽量轻量,只写后台 worker 开跑前必须落地的东西。
    // 不在这里改 agentKey/chatflowId,避免后台 worker 半路失败导致 state 与 dify 会话错位;
    // 等 worker 拿到 Dify 返回之后,统一在最终 tx 里一次性切换。
    await this.prisma.$transaction(async (tx) => {
      if (ctx.userText) {
        await tx.message.create({
          data: {
            id: `router-user-${randomUUID()}`,
            conversationId: ctx.conversationId,
            userId: ctx.userId,
            role: MessageRole.USER,
            type: "user",
            text: ctx.userText,
            agentKey: ctx.decision.agentKey
          }
        });
      }
      await tx.streamEvent.create({
        data: {
          streamId,
          conversationId: ctx.conversationId,
          eventIndex: 0,
          type: "meta",
          payload: toJson(metaEvent)
        }
      });
      await tx.conversationState.update({
        where: { id: ctx.state.id },
        data: {
          status: this.deriveSessionStatus(ctx.input, ctx.userText),
          currentStep: this.deriveNextStep(ctx.decision, ctx.input)
        }
      });
    });

    // 注册 abort 句柄,再 kick off worker。cancelStream 会通过这张表找到 controller
    // 远程掐掉 Dify SSE。worker 内部 finally 会负责清理 map entry。
    const abortController = new AbortController();
    this.streamAbortControllers.set(streamId, {
      sessionId: ctx.state.id,
      controller: abortController
    });

    // fire-and-forget:任何异常都在 worker 内部落成 error event,不往上抛。
    void this.runStreamingWorker({ streamId, signal: abortController.signal, ...ctx }).catch((error) => {
      this.logger.error(
        `runStreamingWorker crashed (streamId=${streamId}): ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    });

    return {
      streamId,
      sessionId: ctx.state.id,
      conversationStateId: ctx.state.id,
      agentKey: ctx.decision.agentKey,
      routeMode: ctx.decision.mode,
      chatflowId: ctx.decision.chatflowId,
      activeChatflowId: ctx.decision.chatflowId,
      assetReportStatus: "idle" as AssetReportStatus,
      lastError: "",
      status: "streaming",
      // 保持空数组 → 前端 runRouterAction 会立刻进入 pollStreamEvents,
      // 第一次 poll 就能拿到 meta(已经写好了)后续 poll 拿增量 token。
      events: [] as Array<Record<string, unknown>>
    };
  }

  private async runStreamingWorker(ctx: {
    streamId: string;
    signal: AbortSignal;
    state: {
      id: string;
      agentKey: RouterAgentKey;
      chatflowId: string;
      difyConversationId: string | null;
      status: RouterSessionStatus;
    };
    decision: RoutingDecision;
    input: StartRouterStreamInputDto;
    userText: string;
    userId: string;
    moduleSession: ModuleSessionState;
    parkingLot: ParkingLotState;
    conversationId: string;
  }) {
    const {
      streamId,
      signal,
      state,
      decision,
      input,
      userText,
      userId,
      moduleSession,
      parkingLot,
      conversationId
    } = ctx;
    let eventIndex = 1; // 0 已经被 meta 占了
    const isCancelled = () => signal.aborted;

    const writeEvent = async (event: Record<string, unknown>) => {
      const currentIndex = eventIndex;
      eventIndex += 1;
      await this.prisma.streamEvent.create({
        data: {
          streamId,
          conversationId,
          eventIndex: currentIndex,
          type: String(event.type || "token"),
          payload: toJson(event)
        }
      });
    };

    try {
      const handoff = await this.buildHandoffContext({
        userId,
        state,
        decision,
        userText,
        input,
        moduleSession
      });

      const [sessionEntries, facts, summaries] = await Promise.all([
        this.sessionWindowService.fetchRecent(userId),
        this.fetchUserFactsForAgent(userId, decision.agentKey),
        this.chatflowSummaryService.fetchLayerCSummaries(userId)
      ]);
      const memoryBlock = [
        this.sessionWindowService.formatAsLayerA(sessionEntries),
        this.formatFactsAsLayerB(facts),
        this.chatflowSummaryService.formatAsLayerC(summaries)
      ]
        .filter((section) => section && section.trim())
        .join("\n\n");

      const query = this.buildModelQuery(
        decision.agentKey,
        decision.chatflowId,
        userText,
        memoryBlock,
        handoff
      );
      const apiKey = this.resolveDifyApiKey(decision.agentKey);
      const snapshotContext = await this.difySnapshotContextService.buildSnapshotInputs(userId, {
        channel: "router",
        agentKey: decision.agentKey
      });

      const difyResult = await this.difyService.sendChatMessageStreaming(
        {
          query,
          user: userId,
          conversationId: moduleSession.difyConversationId || "",
          inputs: snapshotContext.inputs
        },
        {
          onToken: async (delta) => {
            if (isCancelled()) return;
            // 每个 Dify chunk 直接落成一行 streamEvent。
            // chunk 的粒度由 Dify 那头决定(通常几字到十几字),不做二次拆分。
            await writeEvent({
              type: "token",
              streamId,
              token: delta
            });
          }
        },
        { apiKey, signal }
      );

      // 拿到答案但 worker 在途中被 abort → 不做 finalize / 不入 memory / 不写 assistant
      // message。前端早就停止 poll 了,这里静默退场即可。
      if (isCancelled()) {
        return;
      }

      const rawAnswer = String(difyResult.answer || "").trim();
      const answer = stripInternalMarkers(rawAnswer) || "收到,我们继续往下梳理。";
      const generated = {
        answer,
        nextQuestion: "",
        difyConversationId: difyResult.conversationId,
        providerMessageId: difyResult.messageId,
        assetWorkflowKey: "",
        reportStatus: "idle" as AssetReportStatus,
        reportError: ""
      };

      const nextParkingLot = this.updateParkingLotAfterResponse({
        parkingLot,
        currentAgentKey: state.agentKey,
        decision,
        input,
        generated,
        handoff
      });

      await this.prisma.$transaction(async (tx) => {
        await tx.conversationState.update({
          where: { id: state.id },
          data: {
            agentKey: decision.agentKey,
            mode: decision.mode,
            chatflowId: decision.chatflowId,
            difyConversationId:
              difyResult.conversationId || moduleSession.difyConversationId || state.difyConversationId,
            parkingLot: toJson(nextParkingLot)
          }
        });
        await tx.message.create({
          data: {
            id: `router-assistant-${randomUUID()}`,
            conversationId,
            userId,
            role: MessageRole.ASSISTANT,
            type: "agent",
            text: answer,
            agentKey: decision.agentKey,
            providerMessageId: difyResult.messageId
          }
        });
        await tx.behaviorLog.create({
          data: {
            userId,
            eventType: "message_sent",
            eventData: toJson({
              sessionId: state.id,
              agentKey: decision.agentKey,
              inputType: input.inputType,
              streamed: true
            })
          }
        });
      });

      // done 事件放 tx 外,避免跟主事务竞用连接。前端看到 done 会退出 pollStream。
      await writeEvent({
        type: "done",
        streamId,
        usage: {
          promptTokens: 0,
          completionTokens: Array.from(answer).length
        }
      });

      // —— 下面这一坨 fire-and-forget 侧信道:跟 blocking 路径完全一致 ——
      const windowUserRole = input.inputType === "text" ? "user" : "system";
      if (userText) {
        this.sessionWindowService.appendAsync(userId, {
          role: windowUserRole,
          content: userText,
          agentKey: decision.agentKey,
          chatflowId: decision.chatflowId
        });
      }
      if (answer) {
        this.sessionWindowService.appendAsync(userId, {
          role: "assistant",
          content: answer,
          agentKey: decision.agentKey,
          chatflowId: decision.chatflowId
        });
      }
      const extractableUserText = this.extractableUserText(input, userText);
      if (extractableUserText) {
        this.memoryExtractionService.extractAsync(userId, {
          userText: extractableUserText,
          assistantText: answer,
          agentKey: decision.agentKey,
          chatflowId: decision.chatflowId
        });
      }
      const previousAgentKey = state.agentKey;
      const agentChanged = previousAgentKey !== decision.agentKey;
      const isExplicitSwitch = input.inputType === "agent_switch";
      if (agentChanged || isExplicitSwitch) {
        this.chatflowSummaryService.summarizeAsync(userId, {
          agentKey: previousAgentKey,
          chatflowId: state.chatflowId,
          trigger: "agent_switch"
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // 取消是有意的结果,不当成异常冒出去,只 log 一行。前端早就停止 poll,也不需要补写 error event。
      if (isCancelled() || /cancelled/i.test(message)) {
        this.logger.log(`Dify streaming worker cancelled (streamId=${streamId})`);
      } else {
        try {
          await this.prisma.streamEvent.create({
            data: {
              streamId,
              conversationId,
              eventIndex: eventIndex++,
              type: "error",
              payload: toJson({ type: "error", streamId, message })
            }
          });
        } catch (_writeError) {
          // 写 error event 失败时不再重试,直接留在日志里。
        }
        this.logger.error(`Dify streaming worker failed (streamId=${streamId}): ${message}`);
      }
    } finally {
      this.streamAbortControllers.delete(streamId);
    }
  }

  /**
   * 前端点停止键 / 新请求到来时调用。找到对应 streamId 的 AbortController,abort 掉
   * 底层 Dify SSE socket。worker 的 catch / finally 会负责清理。
   * 没找到(已完成或压根不存在)就静默返回 false,不抛 404。
   */
  async cancelStream(streamId: string, user?: Record<string, unknown>): Promise<{ cancelled: boolean }> {
    // resolveUserId 用来确认调用者身份,防止跨用户乱 cancel。
    this.resolveUserId(user);
    const entry = this.streamAbortControllers.get(streamId);
    if (!entry) {
      return { cancelled: false };
    }
    entry.controller.abort();
    this.streamAbortControllers.delete(streamId);
    return { cancelled: true };
  }

  /**
   * 新一轮 startStream 进来时批量 abort 同一 session 上的残留 worker。
   * 常见触发:用户点过停止但后台 worker 还没完全退场,或上一轮因为网络卡顿
   * 前端已经失去兴趣。直接按 sessionId 遍历 map(最多一两个 entry,不心疼)。
   */
  private abortInFlightStreamsForSession(sessionId: string): void {
    for (const [streamId, entry] of this.streamAbortControllers.entries()) {
      if (entry.sessionId === sessionId) {
        entry.controller.abort();
        this.streamAbortControllers.delete(streamId);
      }
    }
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
        nextQuestion: (payload as any).nextQuestion || "",
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

    // Do not emit synthetic fallback cards.
    // Only cards produced by real business logic / providers should be displayed.

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
      currentStep: string | null;
    },
    input: StartRouterStreamInputDto,
    userRecord: User,
    parkingLot: ParkingLotState
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

    if (input.routeAction === "continue_current_flow") {
      return {
        agentKey: state.agentKey,
        mode: state.mode,
        chatflowId: state.chatflowId,
        routeReason: "continue_current_flow"
      };
    }

    if (
      this.policyOpportunityService.shouldProtectActiveFlow({
        mode: state.mode,
        currentStep: state.currentStep,
        routeAction: input.routeAction,
        text: input.text,
        policyMatch: parkingLot.policyMatch
      })
    ) {
      return {
        agentKey: state.agentKey,
        mode: state.mode,
        chatflowId: state.chatflowId,
        routeReason: "policy_flow_switch_confirm"
      };
    }

    const actionDecision = resolveActionDecision(input.routeAction);
    if (actionDecision) {
      const actionAgentKey = actionDecision.agentKey;
      // Phase 1.2 —— 首次落到 4 分支 / 兜底分流时写入 entryPath，仅在字段为空时写
      const entryPathForAction = pickEntryPathFromRouteAction(input.routeAction);
      if (entryPathForAction) {
        void this.userService.setEntryPathIfEmpty(userRecord.id, entryPathForAction).catch(() => undefined);
      }

      // 方案 A —— fulltime_intake_start：全职用户先闲聊主营要点再导入资产盘点
      // 该 action 直接切入 6-闲聊收集流，并用 lastIncompleteStep 标记为 fulltime_main_intake，
      // 后续 generateInfoCollectionReply 读该字段决定 DSL inputs.entry_path
      if (input.routeAction === "fulltime_intake_start") {
        void this.userService
          .updateFlowFlags(userRecord.id, {
            lastIncompleteFlow: "info_collection",
            lastIncompleteStep: "fulltime_main_intake",
            activeChatflowId: INFO_COLLECTION_CHATFLOW_ID
          })
          .catch((err) =>
            this.logger.warn(
              `updateFlowFlags(fulltime_main_intake) failed: ${err instanceof Error ? err.message : String(err)}`
            )
          );
        return {
          agentKey: "master",
          mode: "free",
          chatflowId: INFO_COLLECTION_CHATFLOW_ID,
          routeReason: "route_action:fulltime_intake_start"
        };
      }

      return {
        agentKey: actionAgentKey,
        mode: actionDecision.mode || state.mode,
        chatflowId: this.resolveChatflowId(actionAgentKey),
        cardType: actionDecision.cardType,
        routeReason: `route_action:${input.routeAction}`
      };
    }

    // Phase 2·2 —— User 当前处于 6-闲聊收集流时，除非用户主动切换 agent，否则所有文本继续送到该 chatflow
    if (this.policyOpportunityService.isPolicyFlowActive(parkingLot.policyMatch) && input.inputType !== "agent_switch") {
      return {
        agentKey: "steward",
        mode: "guided",
        chatflowId: this.resolveChatflowId("steward"),
        routeReason: "policy_slot_collect"
      };
    }

    const activeIncompleteFlow = String(
      (userRecord as { lastIncompleteFlow?: string | null }).lastIncompleteFlow || ""
    ).trim();
    if (activeIncompleteFlow === "info_collection" && input.inputType !== "agent_switch") {
      return {
        agentKey: "master",
        mode: "free",
        chatflowId: INFO_COLLECTION_CHATFLOW_ID,
        routeReason: "info_collection_active"
      };
    }

    // Phase 2·3 —— User 当前处于 7-生意体检流时也粘性：所有文本继续送到体检流
    // ⭐ 园区反导：即使本轮 text 命中"园区/政策/返税"等关键词，也不真的路由到 steward，而是
    //             让 DSL 7 的 LLM 在本轮 followup_message 里短回应 + 把话题拉回生意体检。
    if (activeIncompleteFlow === "business_health" && input.inputType !== "agent_switch") {
      return {
        agentKey: "asset",
        mode: "guided",
        chatflowId: BUSINESS_HEALTH_CHATFLOW_ID,
        routeReason: "business_health_active_park_resist"
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
      const keywordAgent = this.matchKeywordAgent(text);
      // Phase 1.3 —— onboarding 阶段未命中关键词 + 未写入 entryPath → 走 5-首登兜底对话流
      if (!keywordAgent && !String(userRecord.entryPath || "").trim() && input.inputType !== "agent_switch") {
        return {
          agentKey: "master",
          mode: "guided",
          chatflowId: ONBOARDING_FALLBACK_CHATFLOW_ID,
          routeReason: "onboarding_fallback"
        };
      }
      const agent = keywordAgent || state.agentKey;
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

  private matchKeywordAgent(text: string): RouterAgentKey | null {
    const raw = String(text || "");
    if (!raw) return null;
    const lowered = raw.toLowerCase();
    // Phase 1.4 —— 中文关键词路由（主力）+ 英文关键词兼容（mock / 测试）
    if (/(园区|注册|政策|返税|入驻|薅|税务|发票|公司|合规|财务)/.test(raw) ||
        /(park|policy|tax|company|finance|compliance|invoice)/.test(lowered)) {
      return "steward";
    }
    if (/(卡住|拖延|动不了|迈不出|害怕|焦虑|完美主义|情绪|压力|抑郁|迷茫|自我怀疑)/.test(raw) ||
        /(stuck|anxiety|fear|mindset|emotion|procrastination)/.test(lowered)) {
      return "mindset";
    }
    if (/(客户|成交|销售|订单|转化|增长|接单|客单价|变现|私域|投流)/.test(raw) ||
        /(client|sales|conversion|revenue|growth|execute|gmv)/.test(lowered)) {
      return "execution";
    }
    if (/(定位|方向|盘一盘|资产|能力|资源|定价|内容|人设)/.test(raw) ||
        /(positioning|direction|ip|content|asset|pricing)/.test(lowered)) {
      return "asset";
    }
    if (/(入门|规划|第一步|路线|从头开始|新手)/.test(raw) ||
        /(start|first step|plan|roadmap)/.test(lowered)) {
      return "master";
    }
    return null;
  }

  private routeByKeyword(text: string, fallback: RouterAgentKey | null): RouterAgentKey {
    return this.matchKeywordAgent(text) || fallback || "master";
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

  // Phase 1.3 —— Layer B 注入源：L1 UserFact 直读
  private async fetchUserFactsForAgent(userId: string, agentKey: RouterAgentKey): Promise<UserFact[]> {
    const categories = USER_FACT_CATEGORIES_BY_AGENT[agentKey] || [];
    if (categories.length === 0) return [];
    return this.prisma.userFact.findMany({
      where: {
        userId,
        isActive: true,
        category: { in: categories }
      },
      orderBy: [
        { confidence: "desc" },
        { updatedAt: "desc" }
      ],
      take: 12
    });
  }

  /**
   * 按 category 聚合成 Layer B 中文文本块，供 prompt 注入。
   * 空输入返回空字符串，调用方据此判断是否拼接。
   *
   * 输出示例：
   *   已知用户信息：
   *   【经历】字节产品经理 3 年 / 之前做外贸
   *   【能力】B 端 SaaS 产品 / 用户研究
   *   【目标】月入 5 万
   */
  private formatFactsAsLayerB(facts: UserFact[]): string {
    if (!facts.length) return "";
    const buckets = new Map<UserFactCategory, string[]>();
    for (const fact of facts) {
      const value = truncateText(fact.factValue, 120);
      if (!value) continue;
      const arr = buckets.get(fact.category) || [];
      if (arr.length < 4) arr.push(value);
      buckets.set(fact.category, arr);
    }
    if (buckets.size === 0) return "";

    // 按 USER_FACT_CATEGORY_LABELS 定义的声明顺序渲染（skill 先于 resource …），
    // 保证同一用户每轮注入顺序稳定。
    const orderedCategories = Object.keys(USER_FACT_CATEGORY_LABELS) as UserFactCategory[];
    const lines: string[] = ["已知用户信息："];
    for (const category of orderedCategories) {
      const values = buckets.get(category);
      if (!values || values.length === 0) continue;
      const label = USER_FACT_CATEGORY_LABELS[category];
      lines.push(`【${label}】${values.join(" / ")}`);
    }
    return lines.join("\n");
  }

  private async generateAssistantReply(input: {
    userId: string;
    agentKey: RouterAgentKey;
    chatflowId: string;
    userText: string;
    difyConversationId: string;
    memoryBlock: string;
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
    // Phase 1.3 —— 首登兜底对话流：独立 Dify key + 独立 conversationId
    if (input.chatflowId === ONBOARDING_FALLBACK_CHATFLOW_ID) {
      return this.generateOnboardingFallbackReply(input);
    }

    // Phase 2·2 —— 闲聊收集流：同上，独立 Dify key + 独立 conversationId
    if (input.chatflowId === INFO_COLLECTION_CHATFLOW_ID) {
      return this.generateInfoCollectionReply(input);
    }

    // Phase 2·3 —— 生意体检流：同上，独立 Dify key + 独立 conversationId
    if (input.chatflowId === BUSINESS_HEALTH_CHATFLOW_ID) {
      return this.generateBusinessHealthReply(input);
    }
    const fallbackQuery = this.buildModelQuery(
      input.agentKey,
      input.chatflowId,
      input.userText,
      input.memoryBlock,
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
        memoryBlock: input.memoryBlock,
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
            // Phase 2·1 —— 报告生成成功后写入 User.hasAssetRadar flag（权威字段）
            void this.userService
              .updateFlowFlags(input.userId, {
                hasAssetRadar: true,
                lastIncompleteFlow: null,
                lastIncompleteStep: null
              })
              .catch((err) =>
                this.logger.warn(
                  `updateFlowFlags(hasAssetRadar) failed: ${err instanceof Error ? err.message : String(err)}`
                )
              );
          } else if (reportOutcome.status === "pending") {
            answer =
              assetWorkflow.workflowKey === "reviewUpdate"
                ? "复盘信息已收齐，报告正在生成中，完成后我会第一时间提醒你。"
                : "资产盘点信息已收齐，报告正在生成中，完成后我会第一时间提醒你。";
          } else if (reportOutcome.status === "failed") {
            answer = "报告生成遇到问题了，我已经记录错误。你可以稍后重试，或继续补充信息后再生成。";
          }
        }

        // Phase 2·2 —— 资产盘点流输出 [USER_REFUSED_INVENTORY] 表示用户连续拒绝结构化盘点，
        // 下一跳交由 6-闲聊收集流 通过自然聊天暗中收集信息，然后用 [GOTO_*] 交还主路由。
        // 这里不阻塞当前回复：先把本轮 LLM 的过渡话术送达用户，同时把 lastIncompleteFlow 标记成
        // info_collection，resolveRoutingDecision 下次路由时会命中该 flag 切到 INFO_COLLECTION_CHATFLOW_ID。
        if (rawAnswer.includes(ASSET_USER_REFUSED_MARKER)) {
          void this.userService
            .updateFlowFlags(input.userId, {
              lastIncompleteFlow: "info_collection",
              lastIncompleteStep: "refused_inventory",
              activeChatflowId: INFO_COLLECTION_CHATFLOW_ID
            })
            .catch((err) =>
              this.logger.warn(
                `updateFlowFlags(info_collection) failed: ${err instanceof Error ? err.message : String(err)}`
              )
            );
        }

        // Phase 2·3 —— 资产盘点流输出 [FORK_TO_BUSINESS_HEALTH] 表示用户披露自己已有在做的生意，
        // 直接分叉到 7-生意体检流。下一轮路由命中该 flag 后走 BUSINESS_HEALTH_CHATFLOW_ID。
        if (rawAnswer.includes(ASSET_FORK_TO_BUSINESS_HEALTH_MARKER)) {
          void this.userService
            .updateFlowFlags(input.userId, {
              lastIncompleteFlow: "business_health",
              lastIncompleteStep: "forked_from_asset",
              activeChatflowId: BUSINESS_HEALTH_CHATFLOW_ID
            })
            .catch((err) =>
              this.logger.warn(
                `updateFlowFlags(business_health) failed: ${err instanceof Error ? err.message : String(err)}`
              )
            );
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
    memoryBlock: string;
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
        memoryBlock: input.memoryBlock
      }),
      flowState
    };
  }

  private buildAssetWorkflowInputs(input: {
    workflowKey: AssetChatWorkflowKey;
    flowState: AssetFlowSnapshot;
    handoff: RouterHandoff | null;
    memoryBlock: string;
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
          intake_summary: this.buildAssetIntakeSummary(input.handoff, input.memoryBlock)
        };
    }
  }

  private buildAssetIntakeSummary(handoff: RouterHandoff | null, memoryBlock: string) {
    const parts: string[] = [];

    if (handoff?.summary) {
      parts.push(handoff.summary);
    }

    const trimmed = (memoryBlock || "").trim();
    if (trimmed) {
      parts.push(trimmed);
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

      // Dify runWorkflow() 的 outputs 没有经过 DifyService.sanitizeAnswer，
      // 而报告生成模型（如 DeepSeek-R1）会在回答前输出 <think>...</think> 思考过程。
      // 这里先剥离思考段，避免把"草稿纸"展示给用户。
      const rawFinalReport = String(result.outputs.final_report || "").replace(
        /<think\b[^>]*>[\s\S]*?<\/think>/gi,
        ""
      );
      const finalReport = stripInternalMarkers(normalizeText(rawFinalReport));
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

  private async generateOnboardingFallbackReply(input: {
    userId: string;
    agentKey: RouterAgentKey;
    chatflowId: string;
    userText: string;
    difyConversationId: string;
    moduleSession: ModuleSessionState;
  }) {
    const apiKey = this.config.difyOnboardingFallbackApiKey;
    const conversationId = input.moduleSession.difyConversationId || "";

    if (this.difyService.isEnabled(apiKey)) {
      try {
        const userRecord = await this.prisma.user.findUnique({
          where: { id: input.userId },
          select: { nickname: true, name: true }
        });
        const nickname = String((userRecord && (userRecord.nickname || userRecord.name)) || "").trim();

        const result = await this.sendModuleChatMessage({
          apiKey,
          conversationId,
          query: input.userText || "[empty]",
          userId: input.userId,
          inputs: {
            user_nickname: nickname,
            user_raw_text: input.userText || ""
          }
        });

        const rawAnswer = String(result.answer || "").trim();
        const parsed = this.parseOnboardingFallbackAnswer(rawAnswer);

        // 根据 handoff marker 写 entryPath —— 只在字段为空时写，避免覆盖用户已确认的分支
        if (parsed.handoff === "inventory") {
          void this.userService
            .setEntryPathIfEmpty(input.userId, "fallback_to_inventory")
            .catch(() => undefined);
        } else if (parsed.handoff === "park") {
          void this.userService
            .setEntryPathIfEmpty(input.userId, "fallback_to_park")
            .catch(() => undefined);
        }

        return {
          answer: parsed.cleanAnswer || "我先把你说的记下了，我们一点点聊。",
          difyConversationId: result.conversationId || conversationId,
          providerMessageId: result.messageId || "",
          assetWorkflowKey: "",
          reportStatus: "idle" as AssetReportStatus,
          reportError: ""
        };
      } catch (error) {
        if (!this.config.devMockDify) {
          throw new ServiceUnavailableException(
            error instanceof Error && error.message ? error.message : "Dify is unavailable"
          );
        }
      }
    }

    // mock / Dify 未启用时的降级回复
    return {
      answer:
        "我先把你说的记下了，我们慢慢聊。先问一个：你最近最让你卡住或最让你在意的是什么事？",
      difyConversationId: conversationId,
      providerMessageId: "",
      assetWorkflowKey: "",
      reportStatus: "idle" as AssetReportStatus,
      reportError: ""
    };
  }

  private parseOnboardingFallbackAnswer(raw: string): {
    cleanAnswer: string;
    handoff: "inventory" | "park" | "stay" | null;
  } {
    const text = String(raw || "");
    let handoff: "inventory" | "park" | "stay" | null = null;
    if (text.includes(ONBOARDING_FALLBACK_MARKERS.toInventory)) {
      handoff = "inventory";
    } else if (text.includes(ONBOARDING_FALLBACK_MARKERS.toPark)) {
      handoff = "park";
    } else if (text.includes(ONBOARDING_FALLBACK_MARKERS.stay)) {
      handoff = "stay";
    }
    const cleanAnswer = text
      .replace(ONBOARDING_FALLBACK_MARKERS.toInventory, "")
      .replace(ONBOARDING_FALLBACK_MARKERS.toPark, "")
      .replace(ONBOARDING_FALLBACK_MARKERS.stay, "")
      .trim();
    return { cleanAnswer, handoff };
  }

  // Phase 2·2 —— 6-闲聊收集流：用户在资产盘点中拒绝结构化提问后，由本 chatflow 通过自然聊天暗中收集信息
  private async generateInfoCollectionReply(input: {
    userId: string;
    agentKey: RouterAgentKey;
    chatflowId: string;
    userText: string;
    difyConversationId: string;
    moduleSession: ModuleSessionState;
  }) {
    const apiKey = this.config.difyInfoCollectionApiKey;
    const conversationId = input.moduleSession.difyConversationId || "";

    if (this.difyService.isEnabled(apiKey)) {
      try {
        const userRecord = await this.prisma.user.findUnique({
          where: { id: input.userId },
          select: {
            nickname: true,
            name: true,
            lastIncompleteStep: true
          }
        });
        const nickname = String((userRecord && (userRecord.nickname || userRecord.name)) || "").trim();
        // 方案 A —— lastIncompleteStep = "fulltime_main_intake" 时启用全职主营采访模式；
        // 其它情况（例如 refused_inventory）或空值时走默认 refusal 分支
        const entryPath =
          String((userRecord && userRecord.lastIncompleteStep) || "").trim() === "fulltime_main_intake"
            ? "fulltime_main_intake"
            : "refusal";

        const result = await this.sendModuleChatMessage({
          apiKey,
          conversationId,
          query: input.userText || "[empty]",
          userId: input.userId,
          inputs: {
            user_nickname: nickname,
            user_raw_text: input.userText || "",
            entry_path: entryPath
          }
        });

        const rawAnswer = String(result.answer || "").trim();
        const parsed = this.parseInfoCollectionAnswer(rawAnswer);

        // 当本流输出 [GOTO_*] 时，清掉 info_collection flag，下一跳回到主路由
        if (parsed.goto && parsed.goto !== "stay") {
          void this.userService
            .updateFlowFlags(input.userId, {
              lastIncompleteFlow: null,
              lastIncompleteStep: null,
              activeChatflowId: null
            })
            .catch((err) =>
              this.logger.warn(
                `updateFlowFlags(clear info_collection) failed: ${
                  err instanceof Error ? err.message : String(err)
                }`
              )
            );
        }

        return {
          answer: parsed.cleanAnswer || "嗯，我在听。你再多说两句。",
          difyConversationId: result.conversationId || conversationId,
          providerMessageId: result.messageId || "",
          assetWorkflowKey: "",
          reportStatus: "idle" as AssetReportStatus,
          reportError: ""
        };
      } catch (error) {
        if (!this.config.devMockDify) {
          throw new ServiceUnavailableException(
            error instanceof Error && error.message ? error.message : "Dify is unavailable"
          );
        }
      }
    }

    // mock / Dify 未启用时的降级回复
    return {
      answer: "不着急做什么盘点，我们先随便聊聊。你最近花时间最多的是什么事？",
      difyConversationId: conversationId,
      providerMessageId: "",
      assetWorkflowKey: "",
      reportStatus: "idle" as AssetReportStatus,
      reportError: ""
    };
  }

  private parseInfoCollectionAnswer(raw: string): {
    cleanAnswer: string;
    goto: "asset" | "park" | "execution" | "mindset" | "stay" | null;
  } {
    const text = String(raw || "");
    let goto: "asset" | "park" | "execution" | "mindset" | "stay" | null = null;
    if (text.includes(INFO_COLLECTION_GOTO_MARKERS.toAsset)) {
      goto = "asset";
    } else if (text.includes(INFO_COLLECTION_GOTO_MARKERS.toPark)) {
      goto = "park";
    } else if (text.includes(INFO_COLLECTION_GOTO_MARKERS.toExecution)) {
      goto = "execution";
    } else if (text.includes(INFO_COLLECTION_GOTO_MARKERS.toMindset)) {
      goto = "mindset";
    } else if (text.includes(INFO_COLLECTION_GOTO_MARKERS.stay)) {
      goto = "stay";
    }
    const cleanAnswer = text
      .replace(INFO_COLLECTION_GOTO_MARKERS.toAsset, "")
      .replace(INFO_COLLECTION_GOTO_MARKERS.toPark, "")
      .replace(INFO_COLLECTION_GOTO_MARKERS.toExecution, "")
      .replace(INFO_COLLECTION_GOTO_MARKERS.toMindset, "")
      .replace(INFO_COLLECTION_GOTO_MARKERS.stay, "")
      .trim();
    return { cleanAnswer, goto };
  }

  // Phase 2·3 —— 7-生意体检流（business_health_check_flow）
  // 触发条件详见顶部 BUSINESS_HEALTH_CHATFLOW_ID 注释。出口 marker 在 prompt 里明确：
  //   [BUSINESS_HEALTH_COMPLETE] → 写 hasBusinessHealth=true，清 active flag
  //   [GOTO_EXECUTION] / [GOTO_MINDSET] → 清 flag，下一轮回主路由
  //   [RESIST_PARK_REDIRECT] → 用户试图打岔问园区 → LLM 已经在 followup_message 里拉回主题，后端什么都不做
  //   [STAY_IN_BUSINESS_HEALTH] → 维持当前 chatflow
  private async generateBusinessHealthReply(input: {
    userId: string;
    agentKey: RouterAgentKey;
    chatflowId: string;
    userText: string;
    difyConversationId: string;
    moduleSession: ModuleSessionState;
  }) {
    const apiKey = this.config.difyBusinessHealthApiKey;
    const conversationId = input.moduleSession.difyConversationId || "";

    if (this.difyService.isEnabled(apiKey)) {
      try {
        const userRecord = await this.prisma.user.findUnique({
          where: { id: input.userId },
          select: { nickname: true, name: true }
        });
        const nickname = String((userRecord && (userRecord.nickname || userRecord.name)) || "").trim();

        const result = await this.sendModuleChatMessage({
          apiKey,
          conversationId,
          query: input.userText || "[empty]",
          userId: input.userId,
          inputs: {
            user_nickname: nickname,
            user_raw_text: input.userText || ""
          }
        });

        const rawAnswer = String(result.answer || "").trim();
        const parsed = this.parseBusinessHealthAnswer(rawAnswer);

        if (parsed.marker === "complete") {
          // 体检完成：写 hasBusinessHealth=true + 清 active flag
          void this.userService
            .updateFlowFlags(input.userId, {
              hasBusinessHealth: true,
              lastIncompleteFlow: null,
              lastIncompleteStep: null,
              activeChatflowId: null
            })
            .catch((err) =>
              this.logger.warn(
                `updateFlowFlags(hasBusinessHealth) failed: ${
                  err instanceof Error ? err.message : String(err)
                }`
              )
            );
        } else if (parsed.marker === "toExecution" || parsed.marker === "toMindset") {
          // 体检过程中用户明确要切往 execution / mindset：清 flag，交还主路由
          void this.userService
            .updateFlowFlags(input.userId, {
              lastIncompleteFlow: null,
              lastIncompleteStep: null,
              activeChatflowId: null
            })
            .catch((err) =>
              this.logger.warn(
                `updateFlowFlags(clear business_health) failed: ${
                  err instanceof Error ? err.message : String(err)
                }`
              )
            );
        }
        // resistPark / stay / null → 维持当前 chatflow，不动 flag

        return {
          answer: parsed.cleanAnswer || "嗯，继续说。我想知道你生意目前最让你不安的是哪一块。",
          difyConversationId: result.conversationId || conversationId,
          providerMessageId: result.messageId || "",
          assetWorkflowKey: "",
          reportStatus: "idle" as AssetReportStatus,
          reportError: ""
        };
      } catch (error) {
        if (!this.config.devMockDify) {
          throw new ServiceUnavailableException(
            error instanceof Error && error.message ? error.message : "Dify is unavailable"
          );
        }
      }
    }

    // mock / Dify 未启用时的降级回复
    return {
      answer: "我们先做个小体检。你现在这个生意，客户主要是谁、一个月能做多少单？",
      difyConversationId: conversationId,
      providerMessageId: "",
      assetWorkflowKey: "",
      reportStatus: "idle" as AssetReportStatus,
      reportError: ""
    };
  }

  private parseBusinessHealthAnswer(raw: string): {
    cleanAnswer: string;
    marker: "complete" | "toExecution" | "toMindset" | "resistPark" | "stay" | null;
  } {
    const text = String(raw || "");
    let marker: "complete" | "toExecution" | "toMindset" | "resistPark" | "stay" | null = null;
    if (text.includes(BUSINESS_HEALTH_MARKERS.complete)) {
      marker = "complete";
    } else if (text.includes(BUSINESS_HEALTH_MARKERS.toExecution)) {
      marker = "toExecution";
    } else if (text.includes(BUSINESS_HEALTH_MARKERS.toMindset)) {
      marker = "toMindset";
    } else if (text.includes(BUSINESS_HEALTH_MARKERS.resistPark)) {
      marker = "resistPark";
    } else if (text.includes(BUSINESS_HEALTH_MARKERS.stay)) {
      marker = "stay";
    }
    const cleanAnswer = text
      .replace(BUSINESS_HEALTH_MARKERS.complete, "")
      .replace(BUSINESS_HEALTH_MARKERS.toExecution, "")
      .replace(BUSINESS_HEALTH_MARKERS.toMindset, "")
      .replace(BUSINESS_HEALTH_MARKERS.resistPark, "")
      .replace(BUSINESS_HEALTH_MARKERS.stay, "")
      .trim();
    return { cleanAnswer, marker };
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
    memoryBlock: string,
    handoff: RouterHandoff | null
  ) {
    const sections = [
      `Agent: ${agentKey}`,
      `Module: ${chatflowId}`
    ];

    if (handoff && handoff.summary) {
      sections.push(
        `Handoff:\nfrom=${handoff.fromAgentKey}\nto=${handoff.toAgentKey}\nreason=${handoff.routeReason}\n${handoff.summary}`
      );
    }

    const trimmedMemory = (memoryBlock || "").trim();
    if (trimmedMemory) {
      sections.push(trimmedMemory);
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
    const policyMatch = this.policyOpportunityService.normalizePolicyMatchState(raw.policyMatch);
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
      policyMatch: policyMatch || undefined,
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
    .replace(
      /\[(INVENTORY_COMPLETE|REVIEW_COMPLETE|USER_REFUSED_INVENTORY|FORK_TO_BUSINESS_HEALTH|BUSINESS_HEALTH_COMPLETE|RESIST_PARK_REDIRECT)\]/g,
      ""
    )
    .replace(/\[GOTO_(ASSET_INVENTORY|PARK|EXECUTION|MINDSET)\]/g, "")
    .replace(/\[STAY_IN_(FREE_CHAT|BUSINESS_HEALTH|FALLBACK)\]/g, "")
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

// 把 4 个入口分支的 routeAction 映射到 User.entryPath 字段（papert §5.1-§5.3 的 9 档预留 3 档）
function pickEntryPathFromRouteAction(routeAction?: string | null): string | null {
  const key = String(routeAction || "").trim();
  if (!key) return null;
  switch (key) {
    case "route_working":
    case "route_explore":
      return "working_unconsidered";
    case "route_trying":
    case "route_stuck":
      return "trying";
    case "route_fulltime":
    case "route_scale":
    case "fulltime_intake_start":
      return "full_time";
    case "route_park":
      return "park_hook";
    default:
      return null;
  }
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
