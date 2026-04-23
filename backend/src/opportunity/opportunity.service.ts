import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, Project } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { cloneJson, readJsonObject } from "../shared/json";
import { PrismaService } from "../shared/prisma.service";
import { UserService } from "../user.service";
import {
  DECISION_STATUSES,
  DecisionStatus,
  HIDDEN_PROJECT_ARTIFACT_TYPES,
  isDecisionStatus,
  isOpportunityStage,
  OpportunityPrimaryAction,
  OPPORTUNITY_CANONICAL_ARTIFACT_TYPES,
  OPPORTUNITY_MIRROR_ARTIFACT_TYPES,
  OPPORTUNITY_PHASE2_ROUTE,
  OPPORTUNITY_ROUTE_ACTIONS_REQUIRING_PROJECT,
  OpportunityStage,
  normalizeOpportunityRouteAction
} from "./opportunity.constants";

type OpportunityScore = {
  totalScore: number;
  confidence: number;
  dimensionScores: Record<string, number>;
  reasoning: string[];
};

type OpportunitySnapshot = {
  targetUser: string;
  corePain: string;
  valueHypothesis: string;
  scenario: string;
  evidenceSummary: string;
  whyNow: string;
};

type ParsedArtifactBlock = {
  type: string;
  payload: Record<string, unknown>;
};

type ParsedOpportunityBlocks = {
  cleanAnswer: string;
  update: Partial<Record<string, unknown>> | null;
  artifacts: ParsedArtifactBlock[];
};

type OpportunitySummary = {
  projectId: string;
  projectName: string;
  opportunityStage: string;
  decisionStatus: string;
  nextValidationAction: string;
  nextValidationActionAt: string;
  lastValidationSignal: string;
  lastValidationAt: string;
  isFocusOpportunity: boolean;
  opportunityScore: OpportunityScore | null;
  opportunitySnapshot: OpportunitySnapshot;
};

type OpportunityStatePayload = {
  phase2Route: "onboarding_flow" | "asset_audit_flow" | typeof OPPORTUNITY_PHASE2_ROUTE;
  focusProject: OpportunitySummary | null;
  primaryAction: OpportunityPrimaryAction;
  secondaryActions: OpportunityPrimaryAction[];
  phaseSummaryCopy: string;
};

const EMPTY_OPPORTUNITY_SCORE: OpportunityScore = {
  totalScore: 0,
  confidence: 0,
  dimensionScores: {
    pain: 0,
    willingness: 0,
    reachability: 0,
    speed: 0,
    edge: 0
  },
  reasoning: []
};

const EMPTY_OPPORTUNITY_SNAPSHOT: OpportunitySnapshot = {
  targetUser: "",
  corePain: "",
  valueHypothesis: "",
  scenario: "",
  evidenceSummary: "",
  whyNow: ""
};

@Injectable()
export class OpportunityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly userService: UserService
  ) {}

  async getOpportunityState(userId: string): Promise<OpportunityStatePayload> {
    const user = await this.userService.requireUser(userId);
    if (!user.onboardingCompleted) {
      return {
        phase2Route: "onboarding_flow",
        focusProject: null,
        primaryAction: "opportunity_continue_identify",
        secondaryActions: ["opportunity_refresh_assets", "opportunity_free_chat"],
        phaseSummaryCopy: "先完成对话登录和状态分流，我们再进入机会识别。"
      };
    }

    if (!user.hasAssetRadar) {
      return {
        phase2Route: "asset_audit_flow",
        focusProject: null,
        primaryAction: "opportunity_refresh_assets",
        secondaryActions: ["opportunity_free_chat", "opportunity_continue_identify"],
        phaseSummaryCopy: "先把你的资产盘清，我们再判断最值得做的机会。"
      };
    }

    const flags = await this.refreshUserFlags(userId);
    const focusProject = await this.getFocusProject(userId);
    const focusSummary = focusProject ? this.buildProjectOpportunitySummary(focusProject) : null;
    const primaryAction = this.resolvePrimaryAction({
      hasOpportunityScores: flags.hasOpportunityScores,
      hasSelectedDirection: flags.hasSelectedDirection,
      focusProject: focusSummary
    });

    return {
      phase2Route: OPPORTUNITY_PHASE2_ROUTE,
      focusProject: focusSummary,
      primaryAction,
      secondaryActions: this.resolveSecondaryActions(primaryAction),
      phaseSummaryCopy: this.buildPhaseSummaryCopy({
        hasOpportunityScores: flags.hasOpportunityScores,
        hasSelectedDirection: flags.hasSelectedDirection,
        focusProject: focusSummary
      })
    };
  }

  async refreshUserFlags(userId: string) {
    const [scoredProject, scoreArtifact, selectedProject, selectedArtifact] = await Promise.all([
      this.prisma.project.findFirst({
        where: {
          userId,
          deletedAt: null,
          opportunityScore: {
            not: Prisma.DbNull
          }
        },
        select: { id: true }
      }),
      this.prisma.projectArtifact.findFirst({
        where: {
          deletedAt: null,
          type: OPPORTUNITY_CANONICAL_ARTIFACT_TYPES.score,
          versionScope: "current",
          project: {
            userId,
            deletedAt: null
          }
        },
        select: { id: true }
      }),
      this.prisma.project.findFirst({
        where: {
          userId,
          deletedAt: null,
          decisionStatus: "selected"
        },
        select: { id: true }
      }),
      this.prisma.projectArtifact.findFirst({
        where: {
          deletedAt: null,
          type: OPPORTUNITY_CANONICAL_ARTIFACT_TYPES.selected,
          versionScope: "current",
          project: {
            userId,
            deletedAt: null
          }
        },
        select: { id: true }
      })
    ]);

    const hasOpportunityScores = !!(scoredProject || scoreArtifact);
    const hasSelectedDirection = !!(selectedProject || selectedArtifact);

    await this.userService.updateFlowFlags(userId, {
      hasOpportunityScores,
      hasSelectedDirection
    });

    return {
      hasOpportunityScores,
      hasSelectedDirection
    };
  }

  async getFocusProject(userId: string) {
    const candidates = await Promise.all([
      this.prisma.project.findFirst({
        where: {
          userId,
          deletedAt: null,
          isFocusOpportunity: true
        },
        orderBy: {
          updatedAt: "desc"
        }
      }),
      this.prisma.project.findFirst({
        where: {
          userId,
          deletedAt: null,
          OR: [
            { decisionStatus: "selected" },
            { opportunityStage: "validating" }
          ]
        },
        orderBy: {
          updatedAt: "desc"
        }
      }),
      this.prisma.project.findFirst({
        where: {
          userId,
          deletedAt: null,
          OR: [
            { decisionStatus: null },
            { decisionStatus: { notIn: ["parked", "rejected"] } }
          ]
        },
        orderBy: {
          updatedAt: "desc"
        }
      })
    ]);

    return candidates.find(Boolean) || null;
  }

  async ensureOpportunityProject(userId: string) {
    const existing = await this.getFocusProject(userId);
    if (existing) {
      return existing;
    }

    const project = await this.prisma.$transaction(async (tx) => {
      await tx.project.updateMany({
        where: {
          userId,
          deletedAt: null
        },
        data: {
          isFocusOpportunity: false
        }
      });

      return tx.project.create({
        data: {
          id: `project-opportunity-${randomUUID()}`,
          userId,
          name: "当前机会",
          phase: "机会识别",
          status: "待推进",
          statusTone: "muted",
          color: "#10A37F",
          agentLabel: "一树·搞钱",
          decisionStatus: "candidate",
          opportunityStage: "capturing",
          isFocusOpportunity: true,
          conversation: [],
          conversationReplies: []
        }
      });
    });

    return project;
  }

  async getProjectOpportunitySummary(userId: string, projectId: string) {
    const project = await this.requireProject(userId, projectId);
    return this.buildProjectOpportunitySummary(project);
  }

  buildProjectOpportunitySummary(project: Pick<
    Project,
    | "id"
    | "name"
    | "opportunityStage"
    | "decisionStatus"
    | "nextValidationAction"
    | "nextValidationActionAt"
    | "lastValidationSignal"
    | "lastValidationAt"
    | "isFocusOpportunity"
    | "opportunityScore"
    | "opportunitySnapshot"
  >): OpportunitySummary {
    return {
      projectId: project.id,
      projectName: String(project.name || "").trim(),
      opportunityStage: normalizeOpportunityStage(project.opportunityStage),
      decisionStatus: normalizeDecisionStatus(project.decisionStatus),
      nextValidationAction: String(project.nextValidationAction || "").trim(),
      nextValidationActionAt: project.nextValidationActionAt ? project.nextValidationActionAt.toISOString() : "",
      lastValidationSignal: String(project.lastValidationSignal || "").trim(),
      lastValidationAt: project.lastValidationAt ? project.lastValidationAt.toISOString() : "",
      isFocusOpportunity: !!project.isFocusOpportunity,
      opportunityScore: normalizeOpportunityScore(project.opportunityScore),
      opportunitySnapshot: normalizeOpportunitySnapshot(project.opportunitySnapshot)
    };
  }

  parseOpportunityBlocks(answer: string): ParsedOpportunityBlocks {
    const source = String(answer || "");
    const updateMatch = source.match(/<opportunity_update>([\s\S]*?)<\/opportunity_update>/i);
    const update = updateMatch ? safeParseJsonObject(updateMatch[1]) : null;
    const artifacts: ParsedArtifactBlock[] = [];
    const artifactRegex = /<project_artifact(?:\s+type="([^"]+)")?>([\s\S]*?)<\/project_artifact>/gi;
    let artifactMatch: RegExpExecArray | null = artifactRegex.exec(source);
    while (artifactMatch) {
      const type = String(artifactMatch[1] || "").trim();
      const payload = safeParseJsonObject(artifactMatch[2]);
      if (type && payload) {
        artifacts.push({
          type,
          payload
        });
      }
      artifactMatch = artifactRegex.exec(source);
    }

    const cleanAnswer = source
      .replace(/<opportunity_update>[\s\S]*?<\/opportunity_update>/gi, "")
      .replace(/<project_artifact(?:\s+type="[^"]+")?>[\s\S]*?<\/project_artifact>/gi, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    return {
      cleanAnswer,
      update,
      artifacts
    };
  }

  async applyStructuredUpdateFromText(input: {
    userId: string;
    rawAnswer: string;
    projectId?: string;
    allowCreate?: boolean;
  }) {
    const parsed = this.parseOpportunityBlocks(input.rawAnswer);
    const hasPayload = !!parsed.update || parsed.artifacts.length > 0;
    if (!hasPayload) {
      return {
        applied: false,
        cleanAnswer: parsed.cleanAnswer || String(input.rawAnswer || "").trim(),
        projectId: "",
        opportunitySummary: null as OpportunitySummary | null
      };
    }

    let project = input.projectId
      ? await this.requireProject(input.userId, input.projectId)
      : await this.getFocusProject(input.userId);

    if (!project && input.allowCreate) {
      project = await this.ensureOpportunityProject(input.userId);
    }

    if (!project) {
      return {
        applied: false,
        cleanAnswer: parsed.cleanAnswer || String(input.rawAnswer || "").trim(),
        projectId: "",
        opportunitySummary: null as OpportunitySummary | null
      };
    }

    const updated = await this.persistStructuredUpdate({
      userId: input.userId,
      project,
      update: parsed.update,
      artifacts: parsed.artifacts
    });

    return {
      applied: true,
      cleanAnswer: parsed.cleanAnswer || String(input.rawAnswer || "").trim(),
      projectId: updated.id,
      opportunitySummary: this.buildProjectOpportunitySummary(updated)
    };
  }

  async applyTaskFeedbackUpdate(input: {
    userId: string;
    taskId?: string;
    summary?: string;
  }) {
    const taskId = String(input.taskId || "").trim();
    const summary = String(input.summary || "").trim();
    if (!taskId || !summary) {
      return null;
    }

    const task = await this.prisma.dailyTask.findFirst({
      where: {
        id: taskId,
        userId: input.userId
      }
    });
    if (!task || !task.projectId) {
      return null;
    }

    return this.applyFeedbackUpdateToProject({
      userId: input.userId,
      projectId: task.projectId,
      summary
    });
  }

  async applyProjectFeedbackUpdate(input: {
    userId: string;
    projectId: string;
    summary?: string;
  }) {
    const summary = String(input.summary || "").trim();
    const projectId = String(input.projectId || "").trim();
    if (!projectId || !summary) {
      return null;
    }

    return this.applyFeedbackUpdateToProject({
      userId: input.userId,
      projectId,
      summary
    });
  }

  async applyFocusProjectFeedbackUpdate(input: {
    userId: string;
    summary?: string;
  }) {
    const summary = String(input.summary || "").trim();
    if (!summary) {
      return null;
    }

    const project = await this.getFocusProject(input.userId);
    if (!project) {
      return null;
    }

    return this.applyFeedbackUpdateToProject({
      userId: input.userId,
      projectId: project.id,
      summary
    });
  }

  private async applyFeedbackUpdateToProject(input: {
    userId: string;
    projectId: string;
    summary: string;
  }) {
    const project = await this.requireProject(input.userId, input.projectId);
    const currentScore = normalizeOpportunityScore(project.opportunityScore);
    const nextScore = evolveOpportunityScore(currentScore, input.summary);
    const nextStage =
      normalizeDecisionStatus(project.decisionStatus) === "selected"
        ? "validating"
        : normalizeOpportunityStage(project.opportunityStage) || "capturing";
    const nextAction = buildNextValidationAction(input.summary, nextStage);

    const updated = await this.persistStructuredUpdate({
      userId: input.userId,
      project,
      update: {
        opportunityStage: nextStage,
        lastValidationSignal: input.summary,
        lastValidationAt: new Date().toISOString(),
        nextValidationAction: nextAction,
        nextValidationActionAt: new Date().toISOString(),
        opportunityScore: nextScore
      },
      artifacts: []
    });

    return this.buildProjectOpportunitySummary(updated);
  }

  filterVisibleArtifacts<T extends { type?: string | null }>(artifacts: T[]) {
    return (Array.isArray(artifacts) ? artifacts : []).filter((item) => {
      const type = String(item && item.type ? item.type : "").trim();
      return !HIDDEN_PROJECT_ARTIFACT_TYPES.has(type);
    });
  }

  private async persistStructuredUpdate(input: {
    userId: string;
    project: Project;
    update: Partial<Record<string, unknown>> | null;
    artifacts: ParsedArtifactBlock[];
  }) {
    const normalizedPatch = normalizeProjectOpportunityPatch(input.update);
    const explicitArtifacts = input.artifacts;

    await this.prisma.$transaction(async (tx) => {
      if (normalizedPatch.decisionStatus === "selected" || normalizedPatch.isFocusOpportunity === true) {
        await tx.project.updateMany({
          where: {
            userId: input.userId,
            deletedAt: null
          },
          data: {
            isFocusOpportunity: false
          }
        });
      }

      const projectData: Prisma.ProjectUpdateInput = {};
      if ("opportunityStage" in normalizedPatch) {
        projectData.opportunityStage = normalizedPatch.opportunityStage || null;
      }
      if ("decisionStatus" in normalizedPatch) {
        projectData.decisionStatus = normalizedPatch.decisionStatus || null;
      }
      if ("nextValidationAction" in normalizedPatch) {
        projectData.nextValidationAction = normalizedPatch.nextValidationAction || null;
      }
      if ("nextValidationActionAt" in normalizedPatch) {
        const nextValidationActionAt = String(normalizedPatch.nextValidationActionAt || "").trim();
        projectData.nextValidationActionAt = normalizedPatch.nextValidationActionAt
          ? new Date(nextValidationActionAt)
          : null;
      }
      if ("lastValidationSignal" in normalizedPatch) {
        projectData.lastValidationSignal = normalizedPatch.lastValidationSignal || null;
      }
      if ("lastValidationAt" in normalizedPatch) {
        const lastValidationAt = String(normalizedPatch.lastValidationAt || "").trim();
        projectData.lastValidationAt = normalizedPatch.lastValidationAt
          ? new Date(lastValidationAt)
          : null;
      }
      if ("opportunityScore" in normalizedPatch) {
        projectData.opportunityScore = normalizedPatch.opportunityScore as Prisma.InputJsonValue;
      }
      if ("opportunitySnapshot" in normalizedPatch) {
        projectData.opportunitySnapshot = normalizedPatch.opportunitySnapshot as Prisma.InputJsonValue;
      }
      if ("isFocusOpportunity" in normalizedPatch) {
        projectData.isFocusOpportunity = !!normalizedPatch.isFocusOpportunity;
      }

      if (Object.keys(projectData).length) {
        await tx.project.update({
          where: {
            id: input.project.id
          },
          data: projectData
        });
      }

      const artifactsToWrite = buildArtifactsForPersist(normalizedPatch, explicitArtifacts);
      for (const artifact of artifactsToWrite) {
        await this.upsertProjectArtifact(tx, input.project.id, artifact);
      }
    });

    await this.refreshUserFlags(input.userId);
    return this.requireProject(input.userId, input.project.id);
  }

  private async upsertProjectArtifact(
    tx: Prisma.TransactionClient,
    projectId: string,
    artifact: {
      type: string;
      title: string;
      data?: Record<string, unknown>;
      summary?: string;
      meta?: string;
      cta?: Record<string, unknown>;
    }
  ) {
    const existing = await tx.projectArtifact.findFirst({
      where: {
        projectId,
        type: artifact.type,
        versionScope: "current",
        deletedAt: null
      },
      orderBy: {
        updatedAt: "desc"
      }
    });

    const data: Prisma.ProjectArtifactUncheckedCreateInput = {
      id: existing?.id || `artifact-${randomUUID()}`,
      projectId,
      type: artifact.type,
      versionScope: "current",
      title: artifact.title,
      data: artifact.data ? (cloneJson(artifact.data) as Prisma.InputJsonValue) : Prisma.JsonNull,
      summary: artifact.summary || null,
      meta: artifact.meta || null,
      cta: artifact.cta ? (cloneJson(artifact.cta) as Prisma.InputJsonValue) : Prisma.JsonNull
    };

    if (existing) {
      await tx.projectArtifact.update({
        where: {
          id: existing.id
        },
        data: {
          title: data.title,
          data: data.data,
          summary: data.summary,
          meta: data.meta,
          cta: data.cta,
          versionScope: data.versionScope
        }
      });
      return;
    }

    await tx.projectArtifact.create({
      data
    });
  }

  private async requireProject(userId: string, projectId: string) {
    const project = await this.prisma.project.findFirst({
      where: {
        id: projectId,
        userId,
        deletedAt: null
      }
    });

    if (!project) {
      throw new NotFoundException(`Project not found: ${projectId}`);
    }

    return project;
  }

  private resolvePrimaryAction(input: {
    hasOpportunityScores: boolean;
    hasSelectedDirection: boolean;
    focusProject: OpportunitySummary | null;
  }): OpportunityPrimaryAction {
    if (!input.hasOpportunityScores) {
      return "opportunity_continue_identify";
    }

    if (input.hasOpportunityScores && !input.hasSelectedDirection) {
      return "opportunity_compare_select";
    }

    if (input.focusProject && input.focusProject.nextValidationAction) {
      return "opportunity_run_validation";
    }

    return "opportunity_refresh_assets";
  }

  private resolveSecondaryActions(primaryAction: OpportunityPrimaryAction) {
    switch (primaryAction) {
      case "opportunity_continue_identify":
        return ["opportunity_refresh_assets", "opportunity_free_chat"] satisfies OpportunityPrimaryAction[];
      case "opportunity_compare_select":
        return ["opportunity_continue_identify", "opportunity_free_chat"] satisfies OpportunityPrimaryAction[];
      case "opportunity_run_validation":
        return ["opportunity_compare_select", "opportunity_free_chat"] satisfies OpportunityPrimaryAction[];
      case "opportunity_refresh_assets":
        return ["opportunity_continue_identify", "opportunity_free_chat"] satisfies OpportunityPrimaryAction[];
      default:
        return ["opportunity_continue_identify", "opportunity_refresh_assets"] satisfies OpportunityPrimaryAction[];
    }
  }

  private buildPhaseSummaryCopy(input: {
    hasOpportunityScores: boolean;
    hasSelectedDirection: boolean;
    focusProject: OpportunitySummary | null;
  }) {
    if (input.focusProject?.nextValidationAction) {
      return "我已经帮你把机会收束到当前这条主线了，先继续把这个机会往前推进一格。";
    }

    if (input.hasOpportunityScores && !input.hasSelectedDirection) {
      return "我已经整理出几个机会候选，接下来不要再泛聊，先比较并选出一个值得继续做的方向。";
    }

    if (!input.hasOpportunityScores) {
      return "我已经大致盘清你的底子了，接下来我们不再泛聊，开始找最值得做的机会。";
    }

    return "你现在最该做的不是再看功能，而是把一个机会继续往前推进。";
  }
}

function normalizeOpportunityStage(value: unknown) {
  const normalized = String(value || "").trim();
  return isOpportunityStage(normalized) ? normalized : "";
}

function normalizeDecisionStatus(value: unknown) {
  const normalized = String(value || "").trim();
  return isDecisionStatus(normalized) ? normalized : "none";
}

function normalizeOpportunityScore(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const source = value as Record<string, unknown>;
  const dimensionSource =
    source.dimensionScores && typeof source.dimensionScores === "object" && !Array.isArray(source.dimensionScores)
      ? source.dimensionScores as Record<string, unknown>
      : {};
  const reasoning = Array.isArray(source.reasoning)
    ? source.reasoning.map((item) => String(item || "").trim()).filter(Boolean)
    : [];

  return {
    totalScore: clampNumber(source.totalScore, 0, 100),
    confidence: clampFloat(source.confidence, 0, 1),
    dimensionScores: {
      pain: clampNumber(dimensionSource.pain, 0, 100),
      willingness: clampNumber(dimensionSource.willingness, 0, 100),
      reachability: clampNumber(dimensionSource.reachability, 0, 100),
      speed: clampNumber(dimensionSource.speed, 0, 100),
      edge: clampNumber(dimensionSource.edge, 0, 100)
    },
    reasoning
  } satisfies OpportunityScore;
}

function normalizeOpportunitySnapshot(value: unknown) {
  return {
    ...EMPTY_OPPORTUNITY_SNAPSHOT,
    ...readJsonObject(value, EMPTY_OPPORTUNITY_SNAPSHOT)
  };
}

function safeParseJsonObject(value: string) {
  try {
    const parsed = JSON.parse(String(value || "").trim());
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch (_error) {
    return null;
  }

  return null;
}

function normalizeProjectOpportunityPatch(update: Partial<Record<string, unknown>> | null) {
  const source = update && typeof update === "object" ? update : {};
  const patch: Record<string, unknown> = {};

  const opportunityStage = normalizeOpportunityStage(source.opportunityStage);
  if (opportunityStage) {
    patch.opportunityStage = opportunityStage;
  }

  const decisionStatus = normalizeDecisionStatus(source.decisionStatus);
  if (
    typeof source.decisionStatus !== "undefined" &&
    (decisionStatus || String(source.decisionStatus || "").trim() === "")
  ) {
    patch.decisionStatus = decisionStatus;
  }

  const nextValidationAction = String(source.nextValidationAction || "").trim();
  if (typeof source.nextValidationAction !== "undefined") {
    patch.nextValidationAction = nextValidationAction;
  }

  const nextValidationActionAt = normalizeDateString(source.nextValidationActionAt);
  if (typeof source.nextValidationActionAt !== "undefined") {
    patch.nextValidationActionAt = nextValidationActionAt;
  }

  const lastValidationSignal = String(source.lastValidationSignal || "").trim();
  if (typeof source.lastValidationSignal !== "undefined") {
    patch.lastValidationSignal = lastValidationSignal;
  }

  const lastValidationAt = normalizeDateString(source.lastValidationAt);
  if (typeof source.lastValidationAt !== "undefined") {
    patch.lastValidationAt = lastValidationAt;
  }

  const score = normalizeOpportunityScore(source.opportunityScore);
  if (score) {
    patch.opportunityScore = score;
  }

  const snapshot = normalizeOpportunitySnapshot(source.opportunitySnapshot);
  if (hasSnapshotContent(snapshot)) {
    patch.opportunitySnapshot = snapshot;
  }

  if (decisionStatus === "selected") {
    patch.isFocusOpportunity = true;
  }

  return patch;
}

function buildArtifactsForPersist(
  normalizedPatch: Record<string, unknown>,
  explicitArtifacts: ParsedArtifactBlock[]
) {
  const artifacts: Array<{
    type: string;
    title: string;
    data?: Record<string, unknown>;
    summary?: string;
    meta?: string;
    cta?: Record<string, unknown>;
  }> = [];

  const score = normalizeOpportunityScore(normalizedPatch.opportunityScore);
  const snapshot = normalizeOpportunitySnapshot(normalizedPatch.opportunitySnapshot);
  const decisionStatus = normalizeDecisionStatus(normalizedPatch.decisionStatus);
  const nextValidationAction = String(normalizedPatch.nextValidationAction || "").trim();
  const lastValidationSignal = String(normalizedPatch.lastValidationSignal || "").trim();
  const stage = normalizeOpportunityStage(normalizedPatch.opportunityStage);

  if (score) {
    artifacts.push({
      type: OPPORTUNITY_CANONICAL_ARTIFACT_TYPES.score,
      title: "机会评分",
      data: {
        opportunityScore: score,
        opportunitySnapshot: snapshot
      },
      summary: `总分 ${score.totalScore} / 100`
    });
    artifacts.push({
      type: OPPORTUNITY_MIRROR_ARTIFACT_TYPES.score,
      title: "机会评分",
      data: {
        opportunityScore: score,
        opportunitySnapshot: snapshot
      },
      summary: `总分 ${score.totalScore} / 100`
    });
  }

  if (decisionStatus === "selected" || hasSnapshotContent(snapshot)) {
    artifacts.push({
      type: OPPORTUNITY_CANONICAL_ARTIFACT_TYPES.selected,
      title: "已选方向",
      data: {
        decisionStatus,
        opportunityStage: stage,
        opportunitySnapshot: snapshot,
        nextValidationAction
      },
      summary: snapshot.valueHypothesis || snapshot.targetUser || "已确定当前推进方向"
    });
    artifacts.push({
      type: OPPORTUNITY_MIRROR_ARTIFACT_TYPES.selected,
      title: "已选方向",
      data: {
        decisionStatus,
        opportunityStage: stage,
        opportunitySnapshot: snapshot,
        nextValidationAction
      },
      summary: snapshot.valueHypothesis || snapshot.targetUser || "已确定当前推进方向"
    });
  }

  if (nextValidationAction || lastValidationSignal) {
    artifacts.push({
      type: OPPORTUNITY_CANONICAL_ARTIFACT_TYPES.validation,
      title: "验证动作",
      data: {
        opportunityStage: stage,
        decisionStatus,
        nextValidationAction,
        lastValidationSignal,
        opportunityScore: score
      },
      summary: nextValidationAction || lastValidationSignal
    });
  }

  explicitArtifacts.forEach((artifact) => {
    artifacts.push({
      type: artifact.type,
      title: resolveArtifactTitle(artifact.type),
      data: artifact.payload,
      summary: String(artifact.payload.summary || artifact.payload.description || "").trim() || undefined
    });
  });

  return dedupeArtifacts(artifacts);
}

function dedupeArtifacts(
  artifacts: Array<{
    type: string;
    title: string;
    data?: Record<string, unknown>;
    summary?: string;
    meta?: string;
    cta?: Record<string, unknown>;
  }>
) {
  const bucket = new Map<string, {
    type: string;
    title: string;
    data?: Record<string, unknown>;
    summary?: string;
    meta?: string;
    cta?: Record<string, unknown>;
  }>();

  artifacts.forEach((artifact) => {
    if (!artifact.type) {
      return;
    }
    bucket.set(artifact.type, artifact);
  });

  return Array.from(bucket.values());
}

function resolveArtifactTitle(type: string) {
  const normalized = String(type || "").trim();
  if (normalized === OPPORTUNITY_CANONICAL_ARTIFACT_TYPES.score || normalized === OPPORTUNITY_MIRROR_ARTIFACT_TYPES.score) {
    return "机会评分";
  }
  if (
    normalized === OPPORTUNITY_CANONICAL_ARTIFACT_TYPES.selected ||
    normalized === OPPORTUNITY_MIRROR_ARTIFACT_TYPES.selected
  ) {
    return "已选方向";
  }
  if (normalized === OPPORTUNITY_CANONICAL_ARTIFACT_TYPES.validation) {
    return "验证动作";
  }
  return "项目成果";
}

function hasSnapshotContent(snapshot: OpportunitySnapshot) {
  return Object.values(snapshot).some((item) => String(item || "").trim());
}

function normalizeDateString(value: unknown) {
  if (!value) {
    return "";
  }
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toISOString();
}

function clampNumber(value: unknown, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return min;
  }
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function clampFloat(value: unknown, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return min;
  }
  return Math.min(max, Math.max(min, Number(parsed.toFixed(2))));
}

function evolveOpportunityScore(current: OpportunityScore | null, summary: string) {
  const base = current ? cloneJson(current) : cloneJson(EMPTY_OPPORTUNITY_SCORE);
  const normalized = String(summary || "").trim();
  const hasPositive = /(感兴趣|愿意|有预算|继续聊|想了解|可以试|预约|想试试|愿意付费)/.test(normalized);
  const hasNegative = /(太贵|没需求|不需要|拒绝|不感兴趣|没感觉|不痛|先不考虑)/.test(normalized);
  let delta = 0;
  if (hasPositive) {
    delta += 6;
  }
  if (hasNegative) {
    delta -= 6;
  }

  base.totalScore = clampNumber((base.totalScore || 60) + delta, 0, 100);
  base.confidence = clampFloat((base.confidence || 0.35) + 0.08, 0, 1);
  const reasoningLine = normalized.slice(0, 80);
  if (reasoningLine) {
    base.reasoning = [reasoningLine].concat(base.reasoning || []).slice(0, 5);
  }
  return base;
}

function buildNextValidationAction(summary: string, stage: string) {
  const normalized = String(summary || "").trim();
  if (/(太贵|预算|贵)/.test(normalized)) {
    return "准备一个低门槛试运行方案，再问一次对方更愿意先试哪种版本。";
  }
  if (/(没回复|已读不回|没回应)/.test(normalized)) {
    return "24 小时后发一条二选一跟进，缩短对方的决策路径。";
  }
  if (/(感兴趣|愿意|想了解)/.test(normalized)) {
    return "约 15 分钟验证对话，聚焦一个付费场景，把顾虑问透。";
  }
  if (stage === "capturing" || stage === "structuring") {
    return "补 3 条真实用户原话，再把痛点和付费场景写成一句话。";
  }
  if (stage === "scoring" || stage === "comparing") {
    return "补 3 条支持证据和 3 条反对证据，再决定是否继续推进。";
  }
  return "跟进 3 个验证对象，并记录一条最关键的反对意见。";
}
