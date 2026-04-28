import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Project } from "@prisma/client";
import { PrismaService } from "./shared/prisma.service";
import { ChatService } from "./chat.service";
import { OpportunityDifyService } from "./opportunity/opportunity-dify.service";
import { ProjectOpportunityContextBuilder } from "./opportunity/project-opportunity-context.builder";
import { OpportunityService } from "./opportunity/opportunity.service";
import { ContentSecurityService } from "./shared/content-security.service";
import { QuotaService } from "./shared/quota.service";

@Injectable()
export class ProjectService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly chatService: ChatService,
    private readonly opportunityContextBuilder: ProjectOpportunityContextBuilder,
    private readonly opportunityService: OpportunityService,
    private readonly opportunityDify: OpportunityDifyService,
    private readonly contentSecurity: ContentSecurityService,
    private readonly quotaService: QuotaService
  ) {}

  async getProjects(userId: string) {
    return this.prisma.project.findMany({
      where: {
        userId,
        deletedAt: null,
        projectKind: "active_project"
      },
      select: {
        id: true,
        name: true,
        phase: true,
        status: true,
        statusTone: true,
        color: true
      },
      orderBy: {
        updatedAt: "desc"
      },
      take: 1
    });
  }

  async createProject(userId: string, payload: Record<string, unknown>) {
    const existing = await this.opportunityService.getActiveProject(userId);
    if (existing) {
      return {
        id: existing.id,
        name: existing.name,
        phase: existing.phase || "",
        status: existing.status || "",
        statusTone: existing.statusTone || "",
        color: existing.color || ""
      };
    }

    const projectId = String(payload.id || `project-${Date.now()}`).trim();

    const project = await this.prisma.project.create({
      data: {
        id: projectId,
        userId,
        name: readString(payload.name, 120) || "新项目",
        phase: readString(payload.phase, 80) || "探索中",
        status: readString(payload.status, 80) || "进行中",
        statusTone: readString(payload.statusTone, 80) || "muted",
        color: readString(payload.color, 32) || "#378ADD",
        agentLabel: readString(payload.agentLabel, 80),
        projectKind: "active_project",
        projectStage: "running",
        followupStatus: "scheduled",
        leadAgentRole: "execution",
        conversation: [],
        conversationReplies: []
      }
    });

    return {
      id: project.id,
      name: project.name,
      phase: project.phase || "",
      status: project.status || "",
      statusTone: project.statusTone || "",
      color: project.color || ""
    };
  }

  async getProjectDetail(userId: string, projectId: string) {
    const project = await this.prisma.project.findFirst({
      where: {
        id: projectId,
        userId,
        deletedAt: null,
        projectKind: "active_project"
      },
      include: {
        artifacts: {
          where: {
            deletedAt: null
          },
          orderBy: {
            createdAt: "asc"
          }
        }
      }
    });

    if (!project) {
      throw new NotFoundException(`Project not found: ${projectId}`);
    }

    return {
      id: project.id,
      name: project.name,
      phase: project.phase || "",
      status: project.status || "",
      statusTone: project.statusTone || "",
      color: project.color || "",
      agentLabel: project.agentLabel || "",
      projectKind: project.projectKind || "active_project",
      projectStage: project.projectStage || "",
      followupStatus: project.followupStatus || "",
      leadAgentRole: project.leadAgentRole || "",
      workspaceVersion: project.workspaceVersion || 1,
      initiatedAt: project.initiatedAt ? project.initiatedAt.toISOString() : "",
      followupCadenceDays: project.followupCadenceDays || 3,
      nextFollowupAt: project.nextFollowupAt ? project.nextFollowupAt.toISOString() : "",
      lastFollowupAt: project.lastFollowupAt ? project.lastFollowupAt.toISOString() : "",
      currentFollowupCycle: project.currentFollowupCycle || null,
      opportunityStage: project.opportunityStage || "",
      decisionStatus: project.decisionStatus || "none",
      nextValidationAction: project.nextValidationAction || "",
      nextValidationActionAt: project.nextValidationActionAt ? project.nextValidationActionAt.toISOString() : "",
      lastValidationSignal: project.lastValidationSignal || "",
      lastValidationAt: project.lastValidationAt ? project.lastValidationAt.toISOString() : "",
      isFocusOpportunity: !!project.isFocusOpportunity,
      opportunityScore: project.opportunityScore || null,
      opportunitySnapshot: project.opportunitySnapshot || null,
      opportunitySummary: this.opportunityService.buildProjectOpportunitySummary(project),
      conversation: Array.isArray(project.conversation) ? project.conversation : [],
      conversationReplies: Array.isArray(project.conversationReplies) ? project.conversationReplies : [],
      artifacts: this.opportunityService.filterVisibleArtifacts(project.artifacts).map((artifact) =>
        normalizeProjectArtifactDto(artifact)
      )
    };
  }

  async updateProject(userId: string, projectId: string, payload: Record<string, unknown>) {
    await this.assertProjectOwnership(userId, projectId);

    await this.prisma.project.update({
      where: {
        id: projectId
      },
      data: {
        name: readString(payload.name, 120),
        phase: readString(payload.phase, 80),
        status: readString(payload.status, 80),
        statusTone: readString(payload.statusTone, 80),
        color: readString(payload.color, 32),
        agentLabel: readString(payload.agentLabel, 80)
      }
    });

    return this.getProjectDetail(userId, projectId);
  }

  async deleteProject(userId: string, projectId: string) {
    await this.assertProjectOwnership(userId, projectId);

    await this.prisma.project.update({
      where: {
        id: projectId
      },
      data: {
        deletedAt: new Date()
      }
    });

    return {
      success: true,
      id: projectId
    };
  }

  async getProjectResults(userId: string, projectId: string) {
    const project = await this.getProjectDetail(userId, projectId);
    const artifacts = Array.isArray(project.artifacts) ? project.artifacts : [];
    return {
      items: artifacts,
      artifacts,
      overview: buildProjectArtifactOverview(project, artifacts)
    };
  }

  async sendProjectMessage(userId: string, projectId: string, payload: Record<string, unknown>) {
    const text = readString(payload.message || payload.content, 5000);
    if (!text) {
      throw new BadRequestException("Project message is required");
    }

    const project = await this.prisma.project.findFirst({
      where: {
        id: projectId,
        userId,
        deletedAt: null,
        projectKind: "active_project"
      }
    });

    if (!project) {
      throw new NotFoundException(`Project not found: ${projectId}`);
    }

    if (isOpportunityFollowupProject(project)) {
      return this.sendOpportunityProjectMessage({
        userId,
        project,
        text
      });
    }

    const opportunityContext = await this.opportunityContextBuilder.buildInputs({
      userId,
      projectId
    });
    const sceneKey = resolveProjectSceneKey(project);
    const chatResult = await this.chatService.sendMessage(
      {
        conversationId: `project-chat-${projectId}`,
        sceneKey,
        message: text,
        inputs: opportunityContext.inputs
      },
      {
        id: userId
      }
    );
    const opportunityPersistResult = await this.opportunityService.applyStructuredUpdateFromText({
      userId,
      projectId,
      rawAnswer: chatResult.assistantMessage.text
    });
    const fallbackOpportunitySummary = opportunityPersistResult.applied
      ? null
      : shouldApplyProjectFeedbackFallback(text, project)
        ? await this.opportunityService.applyProjectFeedbackUpdate({
          userId,
          projectId,
          summary: text
        }).catch(() => null)
        : null;
    const assistantText = opportunityPersistResult.cleanAnswer || chatResult.assistantMessage.text;

    const nextConversation = readConversation(project.conversation).concat([
      {
        id: chatResult.userMessageId,
        sender: "user",
        text
      },
      {
        id: chatResult.assistantMessage.id,
        sender: "agent",
        text: assistantText,
        agentKey: chatResult.agentKey || inferAgentKeyFromProject(project)
      }
    ]);

    const nextConversationReplies = normalizeQuickReplies(chatResult.quickReplies, project.conversationReplies);

    await this.prisma.project.update({
      where: {
        id: projectId
      },
      data: {
        conversation: nextConversation,
        conversationReplies: nextConversationReplies
      }
    });

    return {
      projectId,
      sceneKey,
      conversation: nextConversation,
      conversationReplies: nextConversationReplies,
      assistantMessage: {
        ...chatResult.assistantMessage,
        text: assistantText
      },
      userMessageId: chatResult.userMessageId,
      opportunitySummary:
        opportunityPersistResult.opportunitySummary ||
        fallbackOpportunitySummary ||
        (await this.opportunityService.getProjectOpportunitySummary(userId, projectId))
    };
  }

  async getResultDetail(userId: string, resultId: string) {
    const artifact = await this.prisma.projectArtifact.findFirst({
      where: {
        id: resultId,
        deletedAt: null,
        project: {
          userId,
          deletedAt: null,
          projectKind: "active_project"
        }
      }
    });

    if (!artifact) {
      throw new NotFoundException(`Result not found: ${resultId}`);
    }

    return normalizeProjectArtifactDto(artifact, {
      includeDetails: true
    });
  }

  async initiateProject(userId: string, projectId: string, payload: Record<string, unknown>) {
    const result = await this.opportunityService.initiateProject({
      userId,
      projectId,
      workspaceVersion: Number(payload.workspaceVersion || 0),
      summaryVersion: Number(payload.summaryVersion || payload.initiationSummaryVersion || 0)
    });
    if ("stale" in result && result.stale) {
      return result;
    }
    return {
      ...result,
      projectDetail: await this.getProjectDetail(userId, projectId).catch(() => null)
    };
  }

  async revokeProjectInitiation(userId: string, projectId: string) {
    return this.opportunityService.revokeProjectInitiation({
      userId,
      projectId
    });
  }

  async getCurrentFollowupCycle(userId: string, projectId: string) {
    return this.opportunityService.getCurrentFollowupCycle(userId, projectId);
  }

  private async sendOpportunityProjectMessage(input: {
    userId: string;
    project: Project;
    text: string;
  }) {
    await this.enforceProjectInputSafety(input.userId, input.text);
    await this.quotaService.consumeChatMessage(input.userId);

    const opportunityContext = await this.opportunityContextBuilder.buildInputs({
      userId: input.userId,
      projectId: input.project.id
    });
    const difyReply = await this.opportunityDify.sendProjectFollowupMessage({
      userId: input.userId,
      project: input.project,
      message: input.text,
      inputs: opportunityContext.inputs
    });
    if (!difyReply) {
      throw new BadRequestException("Project followup reply is unavailable");
    }

    const opportunityPersistResult = await this.opportunityService.applyStructuredUpdateFromText({
      userId: input.userId,
      projectId: input.project.id,
      rawAnswer: difyReply.rawAnswer || difyReply.answer
    });
    const fallbackOpportunitySummary = opportunityPersistResult.applied
      ? null
      : shouldApplyProjectFeedbackFallback(input.text, input.project)
        ? await this.opportunityService.applyProjectFeedbackUpdate({
          userId: input.userId,
          projectId: input.project.id,
          summary: input.text
        }).catch(() => null)
        : null;
    const assistantText = opportunityPersistResult.cleanAnswer || difyReply.answer || "收到，我继续帮你往下拆。";
    const userMessageId = `project-user-${Date.now()}-${Math.random()}`;
    const assistantMessageId = `project-agent-${Date.now()}-${Math.random()}`;
    const nextConversation = readConversation(input.project.conversation).concat([
      {
        id: userMessageId,
        sender: "user",
        text: input.text
      },
      {
        id: assistantMessageId,
        sender: "agent",
        text: assistantText,
        agentKey: "execution"
      }
    ]);

    await this.prisma.project.update({
      where: {
        id: input.project.id
      },
      data: {
        conversation: nextConversation,
        conversationReplies: [],
        followupDifyConversationId: difyReply.conversationId || input.project.followupDifyConversationId || null
      }
    });

    return {
      projectId: input.project.id,
      sceneKey: "project_execution_followup",
      conversation: nextConversation,
      conversationReplies: [],
      assistantMessage: {
        id: assistantMessageId,
        type: "agent",
        text: assistantText
      },
      userMessageId,
      opportunitySummary:
        opportunityPersistResult.opportunitySummary ||
        fallbackOpportunitySummary ||
        (await this.opportunityService.getProjectOpportunitySummary(input.userId, input.project.id))
    };
  }

  private async enforceProjectInputSafety(userId: string, text: string) {
    const openId = await this.prisma.user.findFirst({
      where: {
        id: userId,
        deletedAt: null
      },
      select: {
        openId: true
      }
    }).then((user) => user?.openId || "").catch(() => "");
    const result = await this.contentSecurity.checkText(text, {
      openId,
      scene: 2,
      label: "project.opportunityFollowup"
    });
    if (!result.pass) {
      throw this.contentSecurity.buildRejectionException(result, "项目反馈内容");
    }
  }

  private async assertProjectOwnership(userId: string, projectId: string) {
    const project = await this.prisma.project.findFirst({
      where: {
        id: projectId,
        userId,
        deletedAt: null,
        projectKind: "active_project"
      },
      select: {
        id: true
      }
    });

    if (!project) {
      throw new NotFoundException(`Project not found: ${projectId}`);
    }
  }
}

function readString(value: unknown, maxLength: number) {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  return trimmed.slice(0, maxLength);
}

function normalizeProjectArtifactDto(
  artifact: {
    id: string;
    type: string;
    title: string;
    data?: unknown;
    meta?: string | null;
    summary?: string | null;
    cta?: unknown;
    createdAt?: Date;
    updatedAt?: Date;
    versionScope?: string | null;
  },
  options: { includeDetails?: boolean } = {}
) {
  const data = artifact.data && typeof artifact.data === "object" && !Array.isArray(artifact.data)
    ? artifact.data as Record<string, unknown>
    : {};
  const artifactType = String(data.artifact_type || data.artifactType || artifact.type || "").trim();
  const agentRole = String(data.agent_role || data.agentRole || data.sourceAgentRole || inferAgentRoleFromArtifactType(artifactType)).trim();
  const summary = String(artifact.summary || data.summary || data.description || "").trim();
  const tags = Array.isArray(data.tags)
    ? data.tags.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  const metrics = Array.isArray(data.metrics)
    ? data.metrics
    : extractArtifactMetrics(data);
  const details = data.details && typeof data.details === "object" && !Array.isArray(data.details)
    ? data.details as Record<string, unknown>
    : {
      intro: String(data.intro || summary || "").trim(),
      bullets: extractArtifactBullets(data),
      judgment: String(data.judgment || data.yishu_judgment || data.recommendation || "").trim()
    };

  return {
    id: artifact.id,
    resultId: artifact.id,
    artifactId: artifact.id,
    type: artifact.type,
    artifact_type: artifactType,
    artifactType,
    title: artifact.title,
    summary,
    source_agent_name: String(data.source_agent_name || data.sourceAgentName || agentRoleToName(agentRole)).trim(),
    agent_role: agentRole,
    agentRole,
    stage: String(data.stage || inferArtifactStage(artifactType)).trim(),
    category: String(data.category || inferArtifactCategory(artifactType)).trim(),
    status: String(data.status || data.state || "generated").trim(),
    updated_at: artifact.updatedAt ? artifact.updatedAt.toISOString() : "",
    updatedAt: artifact.updatedAt ? artifact.updatedAt.toISOString() : "",
    created_at: artifact.createdAt ? artifact.createdAt.toISOString() : "",
    createdAt: artifact.createdAt ? artifact.createdAt.toISOString() : "",
    tags,
    metrics: metrics.slice(0, 3),
    details,
    data,
    meta: artifact.meta || "",
    cta: artifact.cta && typeof artifact.cta === "object" && !Array.isArray(artifact.cta) ? artifact.cta : null,
    actions: buildArtifactActions(String(data.status || data.state || "generated"), !!artifact.cta),
    ...(options.includeDetails ? { body: data.body || data.bullets || [], raw: data } : {})
  };
}

const PROJECT_ARTIFACT_TARGET_COUNT = 7;

type ProjectArtifactDto = ReturnType<typeof normalizeProjectArtifactDto>;

function buildProjectArtifactOverview(
  project: Record<string, unknown>,
  artifacts: ProjectArtifactDto[]
) {
  const totalCount = artifacts.length;
  const targetCount = PROJECT_ARTIFACT_TARGET_COUNT;
  const completedCount = artifacts.filter((item) => {
    return ["generated", "confirmed", "running", "done"].includes(String(item.status || ""));
  }).length;
  const safeCompletedCount = Math.min(completedCount, targetCount);
  const progressPercent = targetCount > 0
    ? Math.min(100, Math.round((safeCompletedCount / targetCount) * 100))
    : 0;
  const cycle = readRecord(project.currentFollowupCycle);
  const nextStep = readFirstString(
    project.nextRecommendation,
    project.nextValidationAction,
    cycle.nextRecommendation,
    "完成第 1 轮客户验证，拿到真实反馈。"
  );

  return {
    totalCount,
    completedCount: safeCompletedCount,
    targetCount,
    progressText: `${safeCompletedCount}/${targetCount}`,
    progressPercent,
    showProgress: true,
    title: totalCount ? `已沉淀 ${totalCount} 项成果` : "还没有成果",
    subtitle: `下一步：${nextStep}`,
    nextStep,
    hint: totalCount
      ? "别只收藏成果，今天要拿一个去验证。"
      : "一树会先帮你把方向、客户和验证动作沉淀下来。",
    ctaText: totalCount ? "去验证" : "回到对话"
  };
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function readFirstString(...values: unknown[]) {
  for (const value of values) {
    const text = String(value || "").trim();
    if (text) {
      return text;
    }
  }

  return "";
}

/*
function extractArtifactMetrics(data: Record<string, unknown>) {
  const metrics: Array<{ label: string; value: string }> = [];
  const directions = Array.isArray(data.directions) ? data.directions : [];
  if (directions.length) {
    metrics.push({ label: "候选方向", value: `${directions.length}个` });
  }
  const score = data.totalScore || data.highestScore || data.score;
  if (score) {
    metrics.push({ label: "评分", value: String(score) });
  }
  const suggestion = data.suggestion || data.nextAction || data.nextRecommendation;
  if (suggestion) {
    metrics.push({ label: "建议", value: String(suggestion).slice(0, 12) });
  }
  return metrics;
}

function extractArtifactBullets(data: Record<string, unknown>) {
  const source = data.bullets || data.body || data.key_points || data.keyPoints || data.directions || [];
  if (!Array.isArray(source)) {
    return [];
  }
  return source
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (item && typeof item === "object") {
        const record = item as Record<string, unknown>;
        return String(record.title || record.label || record.name || record.summary || "").trim();
      }
      return "";
    })
    .filter(Boolean)
    .slice(0, 8);
}

function buildArtifactActions(status: string, hasCta: boolean) {
  const actions = [
    { key: "view", label: "查看" },
    { key: "continue", label: "继续聊" },
    { key: "share", label: "分享" }
  ];
  if (status === "draft") {
    actions.splice(1, 0, { key: "confirm", label: "确认" });
  }
  if (hasCta) {
    actions.push({ key: "cta", label: "去推进" });
  }
  return actions;
}

function inferAgentRoleFromArtifactType(type: string) {
  if (/park|profit|business_health/i.test(type)) return "guanjia";
  if (/followup|validation|pricing|outreach|product/i.test(type)) return "gaoqian";
  return "waibao";
}

function agentRoleToName(role: string) {
  if (role === "gaoqian" || role === "execution") return "一树 · 搞钱";
  if (role === "guanjia" || role === "steward") return "一树 · 管家";
  if (role === "zhaxin" || role === "mindset") return "一树 · 扎心";
  if (role === "yishu" || role === "master") return "一树";
  return "一树 · 挖宝";
}

function inferArtifactStage(type: string) {
  if (/brief|initiation/i.test(type)) return "立项准备";
  if (/followup|validation|score/i.test(type)) return "客户验证";
  if (/product|pricing|outreach/i.test(type)) return "产品成交";
  if (/health|park|profit|system/i.test(type)) return "系统化";
  return "方向判断";
}

function inferArtifactCategory(type: string) {
  if (/brief|product|pricing/i.test(type)) return "方案";
  if (/followup|validation|score/i.test(type)) return "验证";
  if (/outreach|deal|pricing/i.test(type)) return "成交";
  if (/health|park|profit|system/i.test(type)) return "系统";
  return "方向";
}

*/

function extractArtifactMetrics(data: Record<string, unknown>) {
  const metrics: Array<{ label: string; value: string }> = [];
  const directions = Array.isArray(data.directions) ? data.directions : [];
  if (directions.length) {
    metrics.push({ label: "\u5019\u9009\u65b9\u5411", value: `${directions.length}\u4e2a` });
  }
  const score = data.totalScore || data.highestScore || data.score;
  if (score) {
    metrics.push({ label: "\u8bc4\u5206", value: String(score) });
  }
  const suggestion = data.suggestion || data.nextAction || data.nextRecommendation;
  if (suggestion) {
    metrics.push({ label: "\u5efa\u8bae", value: String(suggestion).slice(0, 12) });
  }
  return metrics;
}

function extractArtifactBullets(data: Record<string, unknown>) {
  const source = data.bullets || data.body || data.key_points || data.keyPoints || data.directions || [];
  if (!Array.isArray(source)) {
    return [];
  }
  return source
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (item && typeof item === "object") {
        const record = item as Record<string, unknown>;
        return String(record.title || record.label || record.name || record.summary || "").trim();
      }
      return "";
    })
    .filter(Boolean)
    .slice(0, 8);
}

function buildArtifactActions(status: string, hasCta: boolean) {
  const actions = [
    { key: "view", label: "\u67e5\u770b" },
    { key: "continue", label: "\u7ee7\u7eed\u804a" },
    { key: "share", label: "\u5206\u4eab" }
  ];
  if (status === "draft") {
    actions.splice(1, 0, { key: "confirm", label: "\u786e\u8ba4" });
  }
  if (hasCta) {
    actions.push({ key: "cta", label: "\u53bb\u63a8\u8fdb" });
  }
  return actions;
}

function inferAgentRoleFromArtifactType(type: string) {
  if (/park|profit|business_health/i.test(type)) return "guanjia";
  if (/followup|validation|pricing|outreach|product/i.test(type)) return "gaoqian";
  return "waibao";
}

function agentRoleToName(role: string) {
  if (role === "gaoqian" || role === "execution") return "\u4e00\u6811 \u00b7 \u641e\u94b1";
  if (role === "guanjia" || role === "steward") return "\u4e00\u6811 \u00b7 \u7ba1\u5bb6";
  if (role === "zhaxin" || role === "mindset") return "\u4e00\u6811 \u00b7 \u624e\u5fc3";
  if (role === "yishu" || role === "master") return "\u4e00\u6811";
  return "\u4e00\u6811 \u00b7 \u6316\u5b9d";
}

function inferArtifactStage(type: string) {
  if (/brief|initiation/i.test(type)) return "\u7acb\u9879\u51c6\u5907";
  if (/followup|validation/i.test(type)) return "\u5ba2\u6237\u9a8c\u8bc1";
  if (/product|pricing|outreach/i.test(type)) return "\u4ea7\u54c1\u6210\u4ea4";
  if (/health|park|profit|system/i.test(type)) return "\u7cfb\u7edf\u5316";
  return "\u65b9\u5411\u5224\u65ad";
}

function inferArtifactCategory(type: string) {
  if (/brief|initiation|product/i.test(type)) return "\u65b9\u6848";
  if (/followup|validation/i.test(type)) return "\u9a8c\u8bc1";
  if (/score|candidate|direction/i.test(type)) return "\u65b9\u5411";
  if (/outreach|deal|pricing/i.test(type)) return "\u6210\u4ea4";
  if (/health|park|profit|system/i.test(type)) return "\u7cfb\u7edf";
  return "\u65b9\u5411";
}

function readConversation(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function inferAgentKeyFromProject(project: { agentLabel?: string | null; name?: string | null }) {
  const label = String(project.agentLabel || "").trim();
  const name = String(project.name || "").trim();

  if (label.includes("挖宝")) {
    return "asset";
  }

  if (label.includes("搞钱")) {
    return "execution";
  }

  if (label.includes("扎心")) {
    return "mindset";
  }

  if (label.includes("管家") || /(园区|财税|薪资|profit)/i.test(name)) {
    return "steward";
  }

  return "execution";
}

function resolveProjectSceneKey(project: { agentLabel?: string | null; name?: string | null }) {
  const agentKey = inferAgentKeyFromProject(project);

  if (agentKey === "asset") {
    return "project_asset_followup";
  }

  if (agentKey === "steward") {
    return "company_park_followup";
  }

  if (agentKey === "mindset") {
    return "social_proof";
  }

  return "project_execution_followup";
}

function shouldApplyProjectFeedbackFallback(
  text: string,
  project: {
    opportunityStage?: string | null;
    nextValidationAction?: string | null;
    opportunityScore?: unknown;
    lastValidationSignal?: string | null;
  }
) {
  const normalized = String(text || "").trim();
  if (normalized.length < 12) {
    return false;
  }

  const hasOpportunityContext = !!(
    project.opportunityStage ||
    project.nextValidationAction ||
    project.opportunityScore ||
    project.lastValidationSignal
  );
  if (!hasOpportunityContext) {
    return false;
  }

  return /(\d+\s*[个条位]|一|二|三|用户|客户|商家|原话|反馈|验证|访谈|问了|愿意|付费|买|痛点|报价|价格|预算|感兴趣|拒绝|担心|没人|没人买|结论|意愿|方案)/.test(normalized);
}

function isOpportunityFollowupProject(project: Project) {
  return project.projectKind === "active_project" && !!(
    project.isFocusOpportunity ||
    project.opportunityStage ||
    project.currentFollowupCycle ||
    project.selectedDirectionSnapshot
  );
}

function normalizeQuickReplies(quickReplies: unknown, fallback: unknown) {
  const labels = Array.isArray(quickReplies)
    ? quickReplies
      .map((item) => {
        if (typeof item === "string") {
          return item.trim();
        }

        if (item && typeof item === "object") {
          return String(item.label || item.text || "").trim();
        }

        return "";
      })
      .filter(Boolean)
    : [];

  if (labels.length) {
    return labels.slice(0, 6);
  }

  return Array.isArray(fallback) ? fallback : [];
}
