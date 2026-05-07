import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { Project } from "@prisma/client";
import { DifySnapshotContextService } from "../dify-snapshot-context.service";
import { DifyService } from "../dify.service";
import { getAppConfig } from "../shared/app-config";

export type DifyBusinessDirectionCandidate = {
  directionId: string;
  title: string;
  targetUser: string;
  corePain: string;
  offerIdea: string;
  monetizationPath: string;
  whyFitUser: string;
  estimatedTimeToFirstSignal: string;
  validationCost: string;
  executionDifficulty: string;
  firstValidationStep: string;
  killSignal: string;
};

export type DifyInitiationSummary = {
  projectName: string;
  oneLinePositioning: string;
  targetUser: string;
  coreOffer: string;
  deliveryMode: string;
  pricingHypothesis: string;
  firstCycleGoal: string;
  firstCycleTasks: string[];
  successCriteria: string[];
  killCriteria: string[];
  evidenceNeeded: string[];
  riskNotes: string[];
};

export type DifyDeepDiveResult = {
  assistantText: string;
  readyToInitiate: boolean;
  deepDiveSummary: string;
  currentValidationQuestion: string;
  initiationSummary: DifyInitiationSummary | null;
  conversationId: string;
  rawAnswer: string;
};

export type DifyFollowupCyclePlan = {
  cycleNo: number;
  generatedReason: "scheduled" | "manual" | "feedback" | "initiation";
  goal: string;
  tasks: Array<{
    id?: string;
    label: string;
    taskType?: string;
  }>;
  successCriteria: string[];
  evidenceNeeded: string[];
  nextRecommendation: string;
  createdAt: string;
  closedAt?: string;
};

@Injectable()
export class OpportunityDifyService {
  private readonly logger = new Logger(OpportunityDifyService.name);
  private readonly config = getAppConfig();

  constructor(
    private readonly difyService: DifyService,
    private readonly snapshotContext: DifySnapshotContextService
  ) {}

  async generateDirections(input: {
    userId: string;
    project: Project;
    candidateSetId: string;
    candidateSetVersion: number;
  }): Promise<DifyBusinessDirectionCandidate[] | null> {
    const apiKey = this.config.difyOpportunityApiKeys.directions;
    if (!this.difyService.isEnabled(apiKey)) {
      return this.handleUnavailable("opportunity directions");
    }

    try {
      const snapshot = await this.snapshotContext.buildSnapshotInputs(input.userId, {
        channel: "chat",
        agentKey: "asset"
      });
      const result = await this.difyService.runWorkflow(
        {
          user: input.userId,
          inputs: {
            ...snapshot.inputs,
            candidate_set_id: input.candidateSetId,
            candidate_set_version: String(input.candidateSetVersion),
            opportunity_workspace: toPrettyJsonString(buildProjectWorkspaceInput(input.project))
          }
        },
        {
          apiKey,
          workflowKey: "opportunity.directions"
        }
      );
      const payload = readWorkflowPayload(result.outputs);
      const directions = normalizeDirections(payload.directions);
      if (directions.length !== 3) {
        throw new Error(`Opportunity directions workflow must return exactly 3 directions, got ${directions.length}`);
      }
      return directions;
    } catch (error) {
      return this.handleFailure("opportunity directions", error);
    }
  }

  async startDeepDive(input: {
    userId: string;
    project: Project;
    selectedDirection: DifyBusinessDirectionCandidate;
  }) {
    return this.sendDeepDiveTurn({
      userId: input.userId,
      project: input.project,
      selectedDirection: input.selectedDirection,
      message: "我选择了这个方向，请开始深聊，并先问我一个最关键的问题。",
      fallbackMode: "start"
    });
  }

  async sendDeepDiveMessage(input: {
    userId: string;
    project: Project;
    selectedDirection: DifyBusinessDirectionCandidate;
    message: string;
  }) {
    return this.sendDeepDiveTurn({
      ...input,
      fallbackMode: "message"
    });
  }

  async sendDeepDiveMessageStreaming(input: {
    userId: string;
    project: Project;
    selectedDirection: DifyBusinessDirectionCandidate;
    message: string;
    onToken?: (delta: string) => void;
  }) {
    const apiKey = this.config.difyOpportunityApiKeys.deepDive;
    if (!this.difyService.isEnabled(apiKey)) {
      if (this.canFallback()) {
        const fallback = buildFallbackDeepDiveResult({
          ...input,
          fallbackMode: "message"
        });
        Array.from(fallback.assistantText || "").forEach((token) => input.onToken?.(token));
        return fallback;
      }
      throw new ServiceUnavailableException("Dify opportunity deep dive flow is not configured");
    }

    try {
      const snapshot = await this.snapshotContext.buildSnapshotInputs(input.userId, {
        channel: "chat",
        agentKey: "asset"
      });
      const reply = await this.difyService.sendChatMessageStreaming(
        {
          query: input.message,
          user: input.userId,
          conversationId: input.project.deepDiveDifyConversationId || "",
          inputs: {
            ...snapshot.inputs,
            selected_direction: toPrettyJsonString(input.selectedDirection),
            deep_dive_summary: input.project.deepDiveSummary || "",
            current_validation_question: input.project.currentValidationQuestion || "",
            opportunity_workspace: toPrettyJsonString(buildProjectWorkspaceInput(input.project))
          }
        },
        {
          onToken: (delta) => input.onToken?.(delta)
        },
        {
          apiKey,
          workflowKey: "opportunity.deep_dive"
        }
      );
      return parseDeepDiveAnswerOrFallback(
        reply.answer || "",
        reply.conversationId || input.project.deepDiveDifyConversationId || "",
        {
          ...input,
          fallbackMode: "message"
        },
        this.logger
      );
    } catch (error) {
      if (this.canFailureFallback()) {
        this.logger.warn(`deep dive streaming Dify fallback: ${resolveErrorMessage(error)}`);
        const fallback = buildFallbackDeepDiveResult({
          ...input,
          fallbackMode: "message"
        });
        Array.from(fallback.assistantText || "").forEach((token) => input.onToken?.(token));
        return fallback;
      }
      throw new ServiceUnavailableException(resolveErrorMessage(error) || "Dify opportunity deep dive flow failed");
    }
  }

  async sendProjectFollowupMessage(input: {
    userId: string;
    project: Project;
    message: string;
    inputs: Record<string, unknown>;
  }): Promise<{
    answer: string;
    conversationId: string;
    messageId: string;
    rawAnswer: string;
  } | null> {
    const apiKey = this.config.difyOpportunityApiKeys.projectFollowup;
    if (!this.difyService.isEnabled(apiKey)) {
      if (this.canFallback()) {
        return buildFallbackProjectFollowupReply(input);
      }
      throw new ServiceUnavailableException("Dify project followup flow is not configured");
    }

    try {
      const reply = await this.difyService.sendChatMessageWithContext(
        {
          query: input.message,
          user: input.userId,
          conversationId: input.project.followupDifyConversationId || "",
          inputs: {
            ...(input.inputs || {}),
            project_workspace: toPrettyJsonString(buildProjectWorkspaceInput(input.project))
          }
        },
        {
          apiKey,
          workflowKey: "opportunity.project_followup"
        }
      );
      return {
        answer: reply.answer || "",
        conversationId: reply.conversationId || input.project.followupDifyConversationId || "",
        messageId: reply.messageId || "",
        rawAnswer: reply.answer || ""
      };
    } catch (error) {
      if (this.canFailureFallback()) {
        this.logger.warn(`project followup Dify fallback: ${resolveErrorMessage(error)}`);
        return buildFallbackProjectFollowupReply(input);
      }
      throw new ServiceUnavailableException(resolveErrorMessage(error) || "Dify project followup flow failed");
    }
  }

  async sendProjectFollowupMessageStreaming(input: {
    userId: string;
    project: Project;
    message: string;
    inputs: Record<string, unknown>;
    onToken?: (delta: string) => void;
  }): Promise<{
    answer: string;
    conversationId: string;
    messageId: string;
    rawAnswer: string;
  } | null> {
    const apiKey = this.config.difyOpportunityApiKeys.projectFollowup;
    if (!this.difyService.isEnabled(apiKey)) {
      if (this.canFallback()) {
        const fallback = buildFallbackProjectFollowupReply(input);
        Array.from(stripOpportunityInternalMarkup(fallback.answer || "")).forEach((token) => input.onToken?.(token));
        return fallback;
      }
      throw new ServiceUnavailableException("Dify project followup flow is not configured");
    }

    try {
      const reply = await this.difyService.sendChatMessageStreaming(
        {
          query: input.message,
          user: input.userId,
          conversationId: input.project.followupDifyConversationId || "",
          inputs: {
            ...(input.inputs || {}),
            project_workspace: toPrettyJsonString(buildProjectWorkspaceInput(input.project))
          }
        },
        {
          onToken: (delta) => input.onToken?.(delta)
        },
        {
          apiKey,
          workflowKey: "opportunity.project_followup"
        }
      );
      return {
        answer: reply.answer || "",
        conversationId: reply.conversationId || input.project.followupDifyConversationId || "",
        messageId: reply.messageId || "",
        rawAnswer: reply.answer || ""
      };
    } catch (error) {
      if (this.canFailureFallback()) {
        this.logger.warn(`project followup Dify streaming fallback: ${resolveErrorMessage(error)}`);
        const fallback = buildFallbackProjectFollowupReply(input);
        Array.from(stripOpportunityInternalMarkup(fallback.answer || "")).forEach((token) => input.onToken?.(token));
        return fallback;
      }
      throw new ServiceUnavailableException(resolveErrorMessage(error) || "Dify project followup flow failed");
    }
  }

  async planFollowupCycle(input: {
    userId: string;
    project: Project;
    cycleNo: number;
    initiationSummary: Record<string, unknown>;
    currentCycle: unknown;
    recentFeedback: unknown[];
  }): Promise<DifyFollowupCyclePlan | null> {
    const apiKey = this.config.difyOpportunityApiKeys.followupPlanner;
    if (!this.difyService.isEnabled(apiKey)) {
      return this.handleUnavailable("opportunity followup planner");
    }

    try {
      const result = await this.difyService.runWorkflow(
        {
          user: input.userId,
          inputs: {
            cycle_no: String(input.cycleNo),
            initiation_summary: toPrettyJsonString(input.initiationSummary),
            current_cycle: toPrettyJsonString(input.currentCycle || {}),
            recent_feedback: toPrettyJsonString(input.recentFeedback || []),
            project_workspace: toPrettyJsonString(buildProjectWorkspaceInput(input.project))
          }
        },
        {
          apiKey,
          workflowKey: "opportunity.followup_planner"
        }
      );
      const payload = readWorkflowPayload(result.outputs);
      const cycle = normalizeFollowupCycle(payload.cycle || payload);
      if (!cycle) {
        throw new Error("Followup planner workflow returned an invalid cycle");
      }
      return {
        ...cycle,
        cycleNo: input.cycleNo,
        generatedReason: "scheduled"
      };
    } catch (error) {
      return this.handleFailure("opportunity followup planner", error);
    }
  }

  private async sendDeepDiveTurn(input: {
    userId: string;
    project: Project;
    selectedDirection: DifyBusinessDirectionCandidate;
    message: string;
    fallbackMode: "start" | "message";
  }): Promise<DifyDeepDiveResult | null> {
    const apiKey = this.config.difyOpportunityApiKeys.deepDive;
    if (!this.difyService.isEnabled(apiKey)) {
      if (this.canFallback()) {
        return buildFallbackDeepDiveResult(input);
      }
      throw new ServiceUnavailableException("Dify opportunity deep dive flow is not configured");
    }

    try {
      const snapshot = await this.snapshotContext.buildSnapshotInputs(input.userId, {
        channel: "chat",
        agentKey: "asset"
      });
      const reply = await this.difyService.sendChatMessageWithContext(
        {
          query: input.message,
          user: input.userId,
          conversationId: input.project.deepDiveDifyConversationId || "",
          inputs: {
            ...snapshot.inputs,
            selected_direction: toPrettyJsonString(input.selectedDirection),
            deep_dive_summary: input.project.deepDiveSummary || "",
            current_validation_question: input.project.currentValidationQuestion || "",
            opportunity_workspace: toPrettyJsonString(buildProjectWorkspaceInput(input.project))
          }
        },
        {
          apiKey,
          workflowKey: "opportunity.deep_dive"
        }
      );
      return parseDeepDiveAnswerOrFallback(
        reply.answer || "",
        reply.conversationId || input.project.deepDiveDifyConversationId || "",
        input,
        this.logger
      );
    } catch (error) {
      if (this.canFailureFallback()) {
        this.logger.warn(`deep dive Dify fallback: ${resolveErrorMessage(error)}`);
        return buildFallbackDeepDiveResult(input);
      }
      throw new ServiceUnavailableException(resolveErrorMessage(error) || "Dify opportunity deep dive flow failed");
    }
  }

  private canFallback() {
    return this.config.devMockDify || !this.config.isReleaseLike;
  }

  private canFailureFallback() {
    return this.config.devMockDify;
  }

  private handleUnavailable(label: string) {
    if (this.canFallback()) {
      return null;
    }
    throw new ServiceUnavailableException(`Dify ${label} flow is not configured`);
  }

  private handleFailure<T>(label: string, error: unknown): T | null {
    if (this.canFailureFallback()) {
      this.logger.warn(`${label} Dify fallback: ${resolveErrorMessage(error)}`);
      return null;
    }
    throw new ServiceUnavailableException(resolveErrorMessage(error) || `Dify ${label} flow failed`);
  }
}

function buildProjectWorkspaceInput(project: Project) {
  return {
    projectId: project.id,
    name: project.name,
    projectKind: project.projectKind,
    projectStage: project.projectStage || "",
    workspaceVersion: project.workspaceVersion || 1,
    candidateSetId: project.candidateSetId || "",
    candidateSetVersion: project.candidateSetVersion || 0,
    initiationSummaryVersion: project.initiationSummaryVersion || 0,
    selectedDirectionSnapshot: project.selectedDirectionSnapshot || null,
    deepDiveSummary: project.deepDiveSummary || "",
    currentValidationQuestion: project.currentValidationQuestion || "",
    currentFollowupCycle: project.currentFollowupCycle || null,
    opportunityStage: project.opportunityStage || "",
    decisionStatus: project.decisionStatus || "",
    nextValidationAction: project.nextValidationAction || "",
    lastValidationSignal: project.lastValidationSignal || "",
    opportunityScore: project.opportunityScore || null,
    opportunitySnapshot: project.opportunitySnapshot || null
  };
}

function parseDeepDiveAnswer(answer: string, conversationId: string): DifyDeepDiveResult {
  const rawAnswer = String(answer || "").trim();
  const payload = extractTaggedJson(rawAnswer, "deep_dive_result");
  if (!payload) {
    throw new Error("Deep dive flow must return <deep_dive_result> JSON block");
  }
  const cleanAnswer = rawAnswer
    .replace(/<deep_dive_result>[\s\S]*?<\/deep_dive_result>/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const initiationSummary = normalizeInitiationSummary(payload?.initiationSummary);
  const assistantText = readStringValue(payload?.assistantText, 5000) || cleanAnswer;

  return {
    assistantText: assistantText || "我先接住这个方向。我们继续把目标用户、交付边界和第一步验证说清楚。",
    readyToInitiate: !!payload?.readyToInitiate && !!initiationSummary,
    deepDiveSummary: readStringValue(payload?.deepDiveSummary, 5000),
    currentValidationQuestion: readStringValue(payload?.currentValidationQuestion, 1000),
    initiationSummary,
    conversationId,
    rawAnswer
  };
}

function parseDeepDiveAnswerOrFallback(
  answer: string,
  conversationId: string,
  input: {
    project: Project;
    selectedDirection: DifyBusinessDirectionCandidate;
    message: string;
    fallbackMode: "start" | "message";
  },
  logger?: Logger
): DifyDeepDiveResult {
  try {
    return parseDeepDiveAnswer(answer, conversationId);
  } catch (error) {
    if (resolveErrorMessage(error) !== "Deep dive flow must return <deep_dive_result> JSON block") {
      throw error;
    }

    logger?.warn("deep dive Dify response missed <deep_dive_result>; using local fallback");
    const rawAnswer = String(answer || "").trim();
    const fallback = buildFallbackDeepDiveResult(input);
    const canUsePlainText = rawAnswer && !/<\/?[a-z][a-z0-9_-]*[\s\S]*?>/i.test(rawAnswer);

    return {
      ...fallback,
      assistantText: canUsePlainText ? rawAnswer : fallback.assistantText,
      conversationId: conversationId || fallback.conversationId,
      rawAnswer
    };
  }
}

function buildFallbackDeepDiveResult(input: {
  project: Project;
  selectedDirection: DifyBusinessDirectionCandidate;
  message: string;
  fallbackMode: "start" | "message";
}): DifyDeepDiveResult {
  const direction = input.selectedDirection;
  const baseSummary = [
    input.project.deepDiveSummary || "",
    input.fallbackMode === "message" ? `用户补充：${input.message}` : ""
  ].filter(Boolean).join("\n");
  const shouldInitiate =
    input.fallbackMode === "message" &&
    (input.message.length >= 8 || /(立项|确认|可以|就这个|开始|够了)/.test(input.message));

  if (!shouldInitiate) {
    const question = `先确认一个关键点：你最容易触达的第一批「${direction.targetUser || "目标用户"}」是谁？你准备怎么找到 3 个真实反馈？`;
    return {
      assistantText: `这个方向可以继续聊。${question}`,
      readyToInitiate: false,
      deepDiveSummary: baseSummary || [
        `已选择方向：${direction.title}`,
        `目标用户：${direction.targetUser}`,
        `核心痛点：${direction.corePain}`,
        `最小验证动作：${direction.firstValidationStep}`
      ].join("\n"),
      currentValidationQuestion: question,
      initiationSummary: null,
      conversationId: input.project.deepDiveDifyConversationId || "",
      rawAnswer: ""
    };
  }

  const summary = buildInitiationSummaryFromDirection(direction, input.message);
  return {
    assistantText: "信息已经够立一个轻量验证项目了。我先把边界收成一张立项卡，你确认后我们进入项目跟进。",
    readyToInitiate: true,
    deepDiveSummary: baseSummary || `已选择方向：${direction.title}\n用户补充：${input.message}`,
    currentValidationQuestion: direction.firstValidationStep,
    initiationSummary: summary,
    conversationId: input.project.deepDiveDifyConversationId || "",
    rawAnswer: ""
  };
}

function buildFallbackProjectFollowupReply(input: {
  project: Project;
  message: string;
}) {
  const nextAction = buildFallbackNextAction(input.message);
  const update = {
    opportunityStage: "validating",
    decisionStatus: "selected",
    lastValidationSignal: input.message,
    lastValidationAt: new Date().toISOString(),
    nextValidationAction: nextAction,
    nextValidationActionAt: new Date().toISOString()
  };
  const answer = [
    `这条反馈有价值。我建议下一步先做：${nextAction}`,
    "",
    `<opportunity_update>${JSON.stringify(update)}</opportunity_update>`
  ].join("\n");
  return {
    answer,
    conversationId: input.project.followupDifyConversationId || "",
    messageId: "",
    rawAnswer: answer
  };
}

function stripOpportunityInternalMarkup(text: string) {
  return String(text || "")
    .replace(/<opportunity_update>[\s\S]*?<\/opportunity_update>/gi, "")
    .replace(/<card\b[\s\S]*?<\/card>/gi, "")
    .replace(/<flow_complete\b[^>]*\/?>/gi, "")
    .replace(/<flow_exit\b[^>]*\/?>/gi, "")
    .trim();
}

function buildFallbackNextAction(text: string) {
  if (/(愿意|感兴趣|想了解|可以|约)/.test(text)) {
    return "把这个高意向对象约到 15 分钟沟通，确认愿意付费的具体结果。";
  }
  if (/(贵|价格|预算|考虑)/.test(text)) {
    return "把方案缩成一个低风险试运行包，单独验证价格阻力。";
  }
  if (/(没回|没回复|不理|已读)/.test(text)) {
    return "24 小时后发一个二选一追问，降低对方回复成本。";
  }
  return "补充 3 条真实用户反馈，再判断继续推进、调整定位或停止。";
}

function buildInitiationSummaryFromDirection(
  direction: DifyBusinessDirectionCandidate,
  userContext = ""
): DifyInitiationSummary {
  const projectName = direction.title ? `${direction.title}验证项目` : "机会验证项目";
  return {
    projectName: projectName.slice(0, 120),
    oneLinePositioning: `为${direction.targetUser || "目标用户"}解决「${direction.corePain || "明确痛点"}」`,
    targetUser: direction.targetUser,
    coreOffer: direction.offerIdea,
    deliveryMode: "先用轻量服务或手工方案验证，再决定是否产品化",
    pricingHypothesis: direction.monetizationPath,
    firstCycleGoal: direction.firstValidationStep || "拿到第一批真实反馈",
    firstCycleTasks: [
      direction.firstValidationStep || "触达 3 个目标用户",
      "记录他们的痛点、当前替代方案和付费意愿",
      userContext ? "基于补充信息更新继续/调整/停止判断" : "整理一次继续/调整/停止判断"
    ],
    successCriteria: ["至少 3 个目标用户给出具体反馈", "至少 1 个用户表达明确试用或付费兴趣"],
    killCriteria: [direction.killSignal || "连续 5 个目标用户都不认为这是重要问题"],
    evidenceNeeded: ["目标用户原话", "是否愿意付费或投入时间", "当前替代方案和预算线索"],
    riskNotes: ["先验证需求强度，不急着做完整产品", "每轮只追一个最小商业假设"]
  };
}

function readWorkflowPayload(outputs: Record<string, unknown>) {
  if (outputs.directions || outputs.cycle) {
    return outputs;
  }

  for (const key of ["result", "output", "text", "answer", "json"]) {
    const candidate = parseJsonObject(outputs[key]);
    if (candidate) {
      return candidate;
    }
  }

  return outputs;
}

function normalizeDirections(value: unknown): DifyBusinessDirectionCandidate[] {
  return Array.isArray(value)
    ? value.map(normalizeDirection).filter((item): item is DifyBusinessDirectionCandidate => !!item)
    : [];
}

function normalizeDirection(value: unknown): DifyBusinessDirectionCandidate | null {
  const source = parseJsonObject(value);
  if (!source) return null;
  const directionId = readStringValue(source.directionId, 128);
  const title = readStringValue(source.title, 120);
  if (!directionId || !title) return null;
  return {
    directionId,
    title,
    targetUser: readStringValue(source.targetUser, 300),
    corePain: readStringValue(source.corePain, 500),
    offerIdea: readStringValue(source.offerIdea, 500),
    monetizationPath: readStringValue(source.monetizationPath, 500),
    whyFitUser: readStringValue(source.whyFitUser, 500),
    estimatedTimeToFirstSignal: readStringValue(source.estimatedTimeToFirstSignal, 120),
    validationCost: readStringValue(source.validationCost, 120),
    executionDifficulty: readStringValue(source.executionDifficulty, 120),
    firstValidationStep: readStringValue(source.firstValidationStep, 500),
    killSignal: readStringValue(source.killSignal, 500)
  };
}

function normalizeInitiationSummary(value: unknown): DifyInitiationSummary | null {
  const source = parseJsonObject(value);
  if (!source) return null;
  const projectName = readStringValue(source.projectName, 120);
  if (!projectName) return null;
  return {
    projectName,
    oneLinePositioning: readStringValue(source.oneLinePositioning, 500),
    targetUser: readStringValue(source.targetUser, 300),
    coreOffer: readStringValue(source.coreOffer, 500),
    deliveryMode: readStringValue(source.deliveryMode, 300),
    pricingHypothesis: readStringValue(source.pricingHypothesis, 300),
    firstCycleGoal: readStringValue(source.firstCycleGoal, 300),
    firstCycleTasks: normalizeTextArray(source.firstCycleTasks).slice(0, 3),
    successCriteria: normalizeTextArray(source.successCriteria).slice(0, 5),
    killCriteria: normalizeTextArray(source.killCriteria).slice(0, 5),
    evidenceNeeded: normalizeTextArray(source.evidenceNeeded).slice(0, 5),
    riskNotes: normalizeTextArray(source.riskNotes).slice(0, 5)
  };
}

function normalizeFollowupCycle(value: unknown): DifyFollowupCyclePlan | null {
  const source = parseJsonObject(value);
  if (!source) return null;
  const tasks = Array.isArray(source.tasks)
    ? source.tasks.map((task) => {
      const item = parseJsonObject(task);
      const label = readStringValue(item?.label, 120);
      return label
        ? {
          id: readStringValue(item?.id, 128),
          label,
          taskType: readStringValue(item?.taskType, 64) || "validation"
        }
        : null;
    }).filter((item): item is { id: string; label: string; taskType: string } => !!item)
    : [];
  if (!tasks.length) return null;
  return {
    cycleNo: Math.max(1, Number(source.cycleNo || 1)),
    generatedReason: "scheduled",
    goal: readStringValue(source.goal, 300) || "验证本轮商业假设",
    tasks: tasks.slice(0, 3),
    successCriteria: normalizeTextArray(source.successCriteria).slice(0, 5),
    evidenceNeeded: normalizeTextArray(source.evidenceNeeded).slice(0, 5),
    nextRecommendation: readStringValue(source.nextRecommendation, 500),
    createdAt: readStringValue(source.createdAt, 64) || new Date().toISOString(),
    closedAt: readStringValue(source.closedAt, 64) || undefined
  };
}

function extractTaggedJson(source: string, tagName: string) {
  const pattern = new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`, "i");
  const match = String(source || "").match(pattern);
  return match ? parseJsonObject(match[1]) : null;
}

function parseJsonObject(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  const source = String(value || "").trim();
  if (!source) return null;
  try {
    const parsed = JSON.parse(source);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch (_error) {
    const firstBrace = source.indexOf("{");
    const lastBrace = source.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      try {
        const parsed = JSON.parse(source.slice(firstBrace, lastBrace + 1));
        return parsed && typeof parsed === "object" && !Array.isArray(parsed)
          ? parsed as Record<string, unknown>
          : null;
      } catch (__error) {
        return null;
      }
    }
    return null;
  }
}

function normalizeTextArray(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => readStringValue(item, 500)).filter(Boolean)
    : [];
}

function readStringValue(value: unknown, maxLength = 5000) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function toPrettyJsonString(value: unknown) {
  try {
    return JSON.stringify(value || {}, null, 2);
  } catch (_error) {
    return "{}";
  }
}

function resolveErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error || "");
}
