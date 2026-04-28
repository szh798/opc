import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, Project } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { cloneJson, readJsonObject } from "../shared/json";
import { PrismaService } from "../shared/prisma.service";
import { UserService } from "../user.service";
import { OpportunityDifyService } from "./opportunity-dify.service";
import { ProjectFollowupReminderService } from "./project-followup-reminder.service";
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
  isFollowupStatus,
  isLeadAgentRole,
  isProjectKind,
  isProjectStage,
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

type BusinessDirectionCandidate = {
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

type FollowupCycle = {
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
  projectKind: string;
  projectStage: string;
  followupStatus: string;
  leadAgentRole: string;
  workspaceVersion: number;
  currentFollowupCycle: FollowupCycle | null;
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
    private readonly userService: UserService,
    private readonly projectFollowupReminder: ProjectFollowupReminderService,
    private readonly opportunityDify: OpportunityDifyService
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
          projectKind: "active_project",
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
          projectKind: "active_project",
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
          projectKind: "active_project",
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

  async getActiveProject(userId: string) {
    return this.prisma.project.findFirst({
      where: {
        userId,
        deletedAt: null,
        projectKind: "active_project"
      },
      orderBy: {
        updatedAt: "desc"
      }
    });
  }

  async getOpportunityDraft(userId: string) {
    return this.prisma.project.findFirst({
      where: {
        userId,
        deletedAt: null,
        projectKind: "opportunity_draft"
      },
      orderBy: {
        updatedAt: "desc"
      }
    });
  }

  async ensureOpportunityProject(userId: string) {
    const existing = await this.getFocusProject(userId);
    if (existing) {
      return existing;
    }

    const draft = await this.getOpportunityDraft(userId);
    if (draft) {
      return draft;
    }

    const project = await this.prisma.$transaction(async (tx) => {
      await tx.project.updateMany({
        where: {
          userId,
          deletedAt: null,
          projectKind: "opportunity_draft"
        },
        data: {
          deletedAt: new Date()
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
          projectKind: "opportunity_draft",
          projectStage: "generating_candidates",
          followupStatus: "scheduled",
          leadAgentRole: "asset",
          workspaceVersion: 1,
          decisionStatus: "candidate",
          opportunityStage: "capturing",
          isFocusOpportunity: false,
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

  async getOpportunityWorkspaceSummary(userId: string) {
    const activeProject = await this.getActiveProject(userId);
    const draft = activeProject ? null : await this.getOpportunityDraft(userId);
    const workspace = draft || null;
    const directionsArtifact = workspace
      ? await this.prisma.projectArtifact.findFirst({
        where: {
          projectId: workspace.id,
          type: OPPORTUNITY_CANONICAL_ARTIFACT_TYPES.directions,
          versionScope: "current",
          deletedAt: null
        },
        orderBy: { updatedAt: "desc" }
      })
      : null;
    const initiationArtifact = workspace
      ? await this.prisma.projectArtifact.findFirst({
        where: {
          projectId: workspace.id,
          type: OPPORTUNITY_CANONICAL_ARTIFACT_TYPES.initiation,
          versionScope: "current",
          deletedAt: null
        },
        orderBy: { updatedAt: "desc" }
      })
      : null;

    return {
      hasActiveProject: !!activeProject,
      activeProjectId: activeProject?.id || "",
      projectId: workspace?.id || "",
      projectStage: workspace ? normalizeProjectStage(workspace.projectStage) : "",
      workspaceVersion: workspace ? Number(workspace.workspaceVersion || 1) : 0,
      candidateSetId: workspace?.candidateSetId || "",
      candidateSetVersion: workspace ? Number(workspace.candidateSetVersion || 0) : 0,
      initiationSummaryVersion: workspace ? Number(workspace.initiationSummaryVersion || 0) : 0,
      selectedDirection:
        workspace?.selectedDirectionSnapshot && typeof workspace.selectedDirectionSnapshot === "object"
          ? workspace.selectedDirectionSnapshot
          : null,
      currentDeepDiveState: workspace
        ? {
          deepDiveSummary: workspace.deepDiveSummary || "",
          currentValidationQuestion: workspace.currentValidationQuestion || "",
          selectionReason: workspace.selectionReason || "",
          nextValidationAction: workspace.nextValidationAction || "",
          lastValidationSignal: workspace.lastValidationSignal || ""
        }
        : null,
      readyToInitiate: !!initiationArtifact || normalizeProjectStage(workspace?.projectStage) === "ready_to_initiate",
      candidateDirections: readArtifactData(directionsArtifact?.data).directions || [],
      initiationSummary: readArtifactData(initiationArtifact?.data).summary || null
    };
  }

  async refreshBusinessDirections(input: {
    userId: string;
    projectId?: string;
    workspaceVersion?: number;
  }) {
    const active = await this.getActiveProject(input.userId);
    if (active) {
      throw new BadRequestException("Active project already exists");
    }

    const draft = input.projectId
      ? await this.requireProject(input.userId, input.projectId)
      : await this.ensureOpportunityProject(input.userId);
    this.assertDraftProject(draft);
    this.assertWorkspaceVersion(draft, input.workspaceVersion);

    const candidateSetId = `candidate-set-${randomUUID()}`;
    const candidateSetVersion = Number(draft.candidateSetVersion || 0) + 1;
    const workspaceVersion = Number(draft.workspaceVersion || 1) + 1;
    const difyDirections = await this.opportunityDify.generateDirections({
      userId: input.userId,
      project: draft,
      candidateSetId,
      candidateSetVersion
    });
    const directions = difyDirections || buildDefaultBusinessDirections(`${candidateSetId}-${candidateSetVersion}`);
    const directionSource = difyDirections ? "dify" : "fallback";

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.project.update({
        where: { id: draft.id },
        data: {
          projectStage: "generating_candidates",
          leadAgentRole: "asset",
          workspaceVersion,
          candidateSetId,
          candidateSetVersion,
          initiationSummaryVersion: 0,
          selectedDirectionSnapshot: Prisma.JsonNull,
          deepDiveSummary: null,
          currentValidationQuestion: null,
          selectionReason: null,
          nextValidationAction: null,
          lastValidationSignal: null
        }
      });
      await upsertArtifact(tx, draft.id, {
        type: OPPORTUNITY_CANONICAL_ARTIFACT_TYPES.directions,
        versionScope: "current",
        title: "商业方向候选",
        data: {
          artifactVersion: candidateSetVersion,
          candidateSetId,
          directions
        },
        summary: "3 个可验证的商业方向"
      });
      await tx.behaviorLog.create({
        data: {
          userId: input.userId,
          eventType: "project_created",
          eventData: {
            event: "directions_generated",
            projectId: draft.id,
            candidateSetId,
            candidateSetVersion,
            directionSource
          } as Prisma.InputJsonValue
        }
      }).catch(() => undefined as never);
      return tx.project.findUniqueOrThrow({ where: { id: draft.id } });
    });

    return {
      projectId: updated.id,
      projectStage: normalizeProjectStage(updated.projectStage),
      workspaceVersion: updated.workspaceVersion,
      candidateSetId,
      candidateSetVersion,
      directionSource,
      directions
    };
  }

  async selectBusinessDirection(input: {
    userId: string;
    projectId: string;
    candidateSetId: string;
    directionId: string;
    workspaceVersion?: number;
    selectionReason?: string;
  }) {
    const draft = await this.requireProject(input.userId, input.projectId);
    this.assertDraftProject(draft);
    this.assertWorkspaceVersion(draft, input.workspaceVersion);
    if (String(draft.candidateSetId || "") !== String(input.candidateSetId || "")) {
      return buildStaleResult(draft);
    }

    const artifact = await this.prisma.projectArtifact.findFirst({
      where: {
        projectId: draft.id,
        type: OPPORTUNITY_CANONICAL_ARTIFACT_TYPES.directions,
        versionScope: "current",
        deletedAt: null
      },
      orderBy: { updatedAt: "desc" }
    });
    const directions = normalizeDirections(readArtifactData(artifact?.data).directions);
    const selectedDirection = directions.find((item) => item.directionId === input.directionId);
    if (!selectedDirection) {
      throw new NotFoundException(`Direction not found: ${input.directionId}`);
    }

    const deepDiveResult = await this.opportunityDify.startDeepDive({
      userId: input.userId,
      project: draft,
      selectedDirection
    });
    const initiationSummary = deepDiveResult?.readyToInitiate && deepDiveResult.initiationSummary
      ? normalizeInitiationSummary(deepDiveResult.initiationSummary)
      : null;
    const initiationSummaryVersion = initiationSummary
      ? Number(draft.initiationSummaryVersion || 0) + 1
      : Number(draft.initiationSummaryVersion || 0);
    const workspaceVersion = Number(draft.workspaceVersion || 1) + 1;
    const fallbackQuestion = `先验证这件事：${selectedDirection.firstValidationStep}`;
    const currentValidationQuestion = deepDiveResult?.currentValidationQuestion || fallbackQuestion;
    const deepDiveSummary = deepDiveResult?.deepDiveSummary || [
      `已选择方向：${selectedDirection.title}`,
      `目标用户：${selectedDirection.targetUser}`,
      `核心痛点：${selectedDirection.corePain}`,
      `最小验证动作：${selectedDirection.firstValidationStep}`
    ].join("\n");
    const assistantText = deepDiveResult?.assistantText || currentValidationQuestion;

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.project.update({
        where: { id: draft.id },
        data: {
          name: initiationSummary?.projectName || draft.name,
          projectStage: initiationSummary ? "ready_to_initiate" : "deep_diving",
          leadAgentRole: "asset",
          workspaceVersion,
          initiationSummaryVersion,
          selectedDirectionSnapshot: selectedDirection as unknown as Prisma.InputJsonValue,
          deepDiveSummary,
          currentValidationQuestion,
          deepDiveDifyConversationId: deepDiveResult?.conversationId || draft.deepDiveDifyConversationId || null,
          selectionReason: readStringValue(input.selectionReason, 1000),
          nextValidationAction: selectedDirection.firstValidationStep,
          opportunitySnapshot: {
            targetUser: selectedDirection.targetUser,
            corePain: selectedDirection.corePain,
            valueHypothesis: selectedDirection.offerIdea,
            scenario: selectedDirection.monetizationPath,
            evidenceSummary: "",
            whyNow: selectedDirection.whyFitUser
          } as Prisma.InputJsonValue
        }
      });
      if (initiationSummary) {
        await upsertArtifact(tx, draft.id, {
          type: OPPORTUNITY_CANONICAL_ARTIFACT_TYPES.initiation,
          versionScope: "current",
          title: "立项摘要",
          data: {
            artifactVersion: initiationSummaryVersion,
            summary: initiationSummary,
            direction: selectedDirection
          },
          summary: initiationSummary.oneLinePositioning
        });
      }
      await tx.behaviorLog.create({
        data: {
          userId: input.userId,
          eventType: "project_created",
          eventData: {
            event: "direction_selected",
            projectId: draft.id,
            directionId: selectedDirection.directionId,
            candidateSetId: input.candidateSetId
          } as Prisma.InputJsonValue
        }
      }).catch(() => undefined as never);
      return tx.project.findUniqueOrThrow({ where: { id: draft.id } });
    });

    return {
      stale: false,
      projectId: updated.id,
      projectStage: normalizeProjectStage(updated.projectStage),
      workspaceVersion: updated.workspaceVersion,
      initiationSummaryVersion: updated.initiationSummaryVersion,
      selectedDirection,
      assistantText,
      readyToInitiate: !!initiationSummary,
      deepDiveSummary,
      currentValidationQuestion,
      initiationSummary
    };
  }

  async sendDeepDiveMessage(input: {
    userId: string;
    projectId: string;
    message: string;
    workspaceVersion?: number;
  }) {
    const message = readStringValue(input.message, 5000);
    if (!message) {
      throw new BadRequestException("Message is required");
    }

    const draft = await this.requireProject(input.userId, input.projectId);
    this.assertDraftProject(draft);
    this.assertWorkspaceVersion(draft, input.workspaceVersion);
    const selectedDirection = normalizeDirection(draft.selectedDirectionSnapshot);
    if (!selectedDirection) {
      throw new BadRequestException("Please select a direction first");
    }

    const deepDiveResult = await this.opportunityDify.sendDeepDiveMessage({
      userId: input.userId,
      project: draft,
      selectedDirection,
      message
    });
    const initiationSummary = deepDiveResult?.readyToInitiate && deepDiveResult.initiationSummary
      ? normalizeInitiationSummary(deepDiveResult.initiationSummary)
      : null;
    const initiationSummaryVersion = initiationSummary
      ? Number(draft.initiationSummaryVersion || 0) + 1
      : Number(draft.initiationSummaryVersion || 0);
    const workspaceVersion = Number(draft.workspaceVersion || 1) + 1;
    const deepDiveSummary = deepDiveResult?.deepDiveSummary || [
      draft.deepDiveSummary || "",
      `用户补充：${message}`
    ].filter(Boolean).join("\n");
    const currentValidationQuestion =
      deepDiveResult?.currentValidationQuestion ||
      draft.currentValidationQuestion ||
      selectedDirection.firstValidationStep;

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.project.update({
        where: { id: draft.id },
        data: {
          name: initiationSummary?.projectName || draft.name,
          projectStage: initiationSummary ? "ready_to_initiate" : "deep_diving",
          workspaceVersion,
          initiationSummaryVersion,
          deepDiveSummary,
          currentValidationQuestion,
          deepDiveDifyConversationId: deepDiveResult?.conversationId || draft.deepDiveDifyConversationId || null,
          nextValidationAction: currentValidationQuestion
        }
      });

      if (initiationSummary) {
        await upsertArtifact(tx, draft.id, {
          type: OPPORTUNITY_CANONICAL_ARTIFACT_TYPES.initiation,
          versionScope: "current",
          title: "立项摘要",
          data: {
            artifactVersion: initiationSummaryVersion,
            summary: initiationSummary,
            direction: selectedDirection
          },
          summary: initiationSummary.oneLinePositioning
        });
      }

      await tx.behaviorLog.create({
        data: {
          userId: input.userId,
          eventType: "project_created",
          eventData: {
            event: initiationSummary ? "deep_dive_ready_to_initiate" : "deep_dive_message",
            projectId: draft.id
          } as Prisma.InputJsonValue
        }
      }).catch(() => undefined as never);

      return tx.project.findUniqueOrThrow({ where: { id: draft.id } });
    });

    return {
      stale: false,
      projectId: updated.id,
      projectStage: normalizeProjectStage(updated.projectStage),
      workspaceVersion: updated.workspaceVersion,
      initiationSummaryVersion: updated.initiationSummaryVersion,
      selectedDirection,
      assistantText: deepDiveResult?.assistantText || currentValidationQuestion,
      readyToInitiate: !!initiationSummary,
      deepDiveSummary,
      currentValidationQuestion,
      initiationSummary
    };
  }

  async initiateProject(input: {
    userId: string;
    projectId: string;
    workspaceVersion?: number;
    summaryVersion?: number;
  }) {
    const project = await this.requireProject(input.userId, input.projectId);
    if (normalizeProjectKind(project.projectKind) === "active_project") {
      return this.buildProjectInitiationPayload(project);
    }

    this.assertDraftProject(project);
    this.assertWorkspaceVersion(project, input.workspaceVersion);
    const expectedSummaryVersion = Number(input.summaryVersion || 0);
    if (expectedSummaryVersion && expectedSummaryVersion !== Number(project.initiationSummaryVersion || 0)) {
      return buildStaleResult(project);
    }

    const otherActive = await this.getActiveProject(input.userId);
    if (otherActive && otherActive.id !== project.id) {
      throw new BadRequestException("Only one active project is supported in V1");
    }

    const initiationArtifact = await this.prisma.projectArtifact.findFirst({
      where: {
        projectId: project.id,
        type: OPPORTUNITY_CANONICAL_ARTIFACT_TYPES.initiation,
        versionScope: "current",
        deletedAt: null
      },
      orderBy: { updatedAt: "desc" }
    });
    const summary = normalizeInitiationSummary(readArtifactData(initiationArtifact?.data).summary);
    if (!summary) {
      throw new BadRequestException("Project is not ready to initiate");
    }
    const cycle = buildFollowupCycleFromSummary(summary, 1, "initiation");
    const now = new Date();
    const nextFollowupAt = alignFollowupAt(now, 3);
    const workspaceVersion = Number(project.workspaceVersion || 1) + 1;

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.project.updateMany({
        where: {
          userId: input.userId,
          deletedAt: null,
          projectKind: "active_project",
          id: { not: project.id }
        },
        data: {
          projectStage: "paused",
          followupStatus: "blocked",
          isFocusOpportunity: false
        }
      });
      await tx.project.update({
        where: { id: project.id },
        data: {
          projectKind: "active_project",
          projectStage: "validating",
          followupStatus: "scheduled",
          leadAgentRole: "execution",
          workspaceVersion,
          name: summary.projectName,
          phase: "机会验证",
          status: "验证中",
          statusTone: "active",
          color: "#10A37F",
          agentLabel: "一树·搞钱",
          decisionStatus: "selected",
          opportunityStage: "validating",
          isFocusOpportunity: true,
          currentFollowupCycle: cycle as unknown as Prisma.InputJsonValue,
          initiatedAt: project.initiatedAt || now,
          lastFollowupAt: now,
          nextFollowupAt,
          followupCadenceDays: 3,
          nextValidationAction: cycle.tasks[0]?.label || summary.firstCycleGoal
        }
      });
      await createFollowupCycleArtifact(tx, project.id, cycle);
      await replaceCycleTasks(tx, {
        userId: input.userId,
        projectId: project.id,
        projectName: summary.projectName,
        cycle
      });
      await tx.behaviorLog.create({
        data: {
          userId: input.userId,
          eventType: "project_created",
          eventData: {
            event: "project_initiated",
            projectId: project.id,
            cycleNo: cycle.cycleNo
          } as Prisma.InputJsonValue
        }
      }).catch(() => undefined as never);
      return tx.project.findUniqueOrThrow({ where: { id: project.id } });
    });

    return this.buildProjectInitiationPayload(updated);
  }

  async revokeProjectInitiation(input: {
    userId: string;
    projectId: string;
  }) {
    const project = await this.requireProject(input.userId, input.projectId);
    if (normalizeProjectKind(project.projectKind) !== "active_project") {
      return this.buildProjectOpportunitySummary(project);
    }

    const cycle = normalizeFollowupCycle(project.currentFollowupCycle);
    if (cycle && cycle.cycleNo > 1) {
      throw new BadRequestException("Only first-cycle projects can be revoked in V1");
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.dailyTask.updateMany({
        where: {
          userId: input.userId,
          projectId: project.id,
          done: false
        },
        data: {
          status: "closed",
          done: false
        }
      });
      await tx.project.update({
        where: { id: project.id },
        data: {
          projectKind: "opportunity_draft",
          projectStage: "ready_to_initiate",
          followupStatus: "scheduled",
          leadAgentRole: "asset",
          workspaceVersion: Number(project.workspaceVersion || 1) + 1,
          decisionStatus: "candidate",
          opportunityStage: "structuring",
          isFocusOpportunity: false,
          currentFollowupCycle: Prisma.JsonNull,
          initiatedAt: null,
          nextFollowupAt: null,
          lastFollowupAt: null,
          status: "待立项",
          statusTone: "muted"
        }
      });
      return tx.project.findUniqueOrThrow({ where: { id: project.id } });
    });

    return this.buildProjectOpportunitySummary(updated);
  }

  async getCurrentFollowupCycle(userId: string, projectId: string) {
    const project = await this.requireActiveProject(userId, projectId);
    return normalizeFollowupCycle(project.currentFollowupCycle);
  }

  async advanceDueFollowupCycles(now = new Date()) {
    const dueProjects = await this.prisma.project.findMany({
      where: {
        deletedAt: null,
        projectKind: "active_project",
        nextFollowupAt: {
          lte: now
        },
        followupStatus: {
          not: "blocked"
        }
      },
      orderBy: {
        nextFollowupAt: "asc"
      },
      take: 50
    });

    for (const project of dueProjects) {
      await this.advanceOneFollowupCycle(project, now).catch(() => undefined);
    }

    return {
      checkedAt: now.toISOString(),
      advanced: dueProjects.length
    };
  }

  private async advanceOneFollowupCycle(project: Project, now: Date) {
    const current = normalizeFollowupCycle(project.currentFollowupCycle);
    const cycleNo = current ? current.cycleNo + 1 : 1;
    const summary = normalizeInitiationSummary(
      readArtifactData(
        (await this.prisma.projectArtifact.findFirst({
          where: {
            projectId: project.id,
            type: OPPORTUNITY_CANONICAL_ARTIFACT_TYPES.initiation,
            versionScope: "current",
            deletedAt: null
          },
          orderBy: { updatedAt: "desc" }
        }))?.data
      ).summary
    );
    const fallbackSummary =
      summary || buildInitiationSummaryFromDirection(normalizeDirection(project.selectedDirectionSnapshot) || buildDefaultBusinessDirections("fallback")[0]);
    const recentFeedback = await this.prisma.taskFeedback.findMany({
      where: {
        userId: project.userId
      },
      orderBy: {
        createdAt: "desc"
      },
      take: 10
    });
    const plannedCycle = await this.opportunityDify.planFollowupCycle({
      userId: project.userId,
      project,
      cycleNo,
      initiationSummary: fallbackSummary,
      currentCycle: current,
      recentFeedback: recentFeedback.map((item) => ({
        taskId: item.taskId || "",
        taskLabel: item.taskLabel || "",
        summary: item.summary || "",
        advice: item.advice || "",
        createdAt: item.createdAt.toISOString()
      }))
    });
    const cycle = plannedCycle || buildFollowupCycleFromSummary(
      fallbackSummary,
      cycleNo,
      "scheduled"
    );
    const nextFollowupAt = alignFollowupAt(now, Number(project.followupCadenceDays || 3));

    await this.prisma.$transaction(async (tx) => {
      await tx.dailyTask.updateMany({
        where: {
          projectId: project.id,
          done: false,
          status: "pending"
        },
        data: {
          status: "carried_over"
        }
      });
      await tx.project.update({
        where: { id: project.id },
        data: {
          currentFollowupCycle: cycle as unknown as Prisma.InputJsonValue,
          followupStatus: "scheduled",
          lastFollowupAt: now,
          nextFollowupAt,
          nextValidationAction: cycle.tasks[0]?.label || cycle.goal
        }
      });
      await createFollowupCycleArtifact(tx, project.id, cycle);
      await replaceCycleTasks(tx, {
        userId: project.userId,
        projectId: project.id,
        projectName: project.name,
        cycle
      });
    });

    this.projectFollowupReminder.enqueueProjectFollowupReminder({
      userId: project.userId,
      projectId: project.id,
      scheduledAt: project.nextFollowupAt || now,
      cycle
    });
  }

  private buildProjectInitiationPayload(project: Project) {
    return {
      projectId: project.id,
      project: this.buildProjectOpportunitySummary(project),
      currentFollowupCycle: normalizeFollowupCycle(project.currentFollowupCycle),
      nextFollowupAt: project.nextFollowupAt ? project.nextFollowupAt.toISOString() : ""
    };
  }

  private assertDraftProject(project: Project) {
    if (normalizeProjectKind(project.projectKind) !== "opportunity_draft") {
      throw new BadRequestException("Project is not an opportunity draft");
    }
  }

  private assertWorkspaceVersion(project: Project, expected?: number) {
    const expectedVersion = Number(expected || 0);
    if (expectedVersion && expectedVersion !== Number(project.workspaceVersion || 1)) {
      throw new BadRequestException({
        stale: true,
        message: "Current workspace has changed. Please refresh and confirm again.",
        currentWorkspaceVersion: Number(project.workspaceVersion || 1)
      });
    }
  }

  buildProjectOpportunitySummary(project: Pick<
    Project,
    | "id"
    | "name"
    | "projectKind"
    | "projectStage"
    | "followupStatus"
    | "leadAgentRole"
    | "workspaceVersion"
    | "currentFollowupCycle"
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
      projectKind: normalizeProjectKind(project.projectKind),
      projectStage: normalizeProjectStage(project.projectStage),
      followupStatus: normalizeFollowupStatus(project.followupStatus),
      leadAgentRole: normalizeLeadAgentRole(project.leadAgentRole),
      workspaceVersion: Number(project.workspaceVersion || 1),
      currentFollowupCycle: normalizeFollowupCycle(project.currentFollowupCycle),
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

  private async requireActiveProject(userId: string, projectId: string) {
    const project = await this.requireProject(userId, projectId);
    if (normalizeProjectKind(project.projectKind) !== "active_project") {
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

function normalizeProjectKind(value: unknown) {
  const normalized = String(value || "").trim();
  return isProjectKind(normalized) ? normalized : "active_project";
}

function normalizeProjectStage(value: unknown) {
  const normalized = String(value || "").trim();
  return isProjectStage(normalized) ? normalized : "";
}

function normalizeFollowupStatus(value: unknown) {
  const normalized = String(value || "").trim();
  return isFollowupStatus(normalized) ? normalized : "";
}

function normalizeLeadAgentRole(value: unknown) {
  const normalized = String(value || "").trim();
  return isLeadAgentRole(normalized) ? normalized : "";
}

function readArtifactData(value: unknown): Record<string, unknown> {
  return readJsonObject(value, {}) as Record<string, unknown>;
}

function readStringValue(value: unknown, maxLength = 5000) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function normalizeDirections(value: unknown): BusinessDirectionCandidate[] {
  return Array.isArray(value)
    ? value.map(normalizeDirection).filter((item): item is BusinessDirectionCandidate => !!item)
    : [];
}

function normalizeDirection(value: unknown): BusinessDirectionCandidate | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const source = value as Record<string, unknown>;
  const directionId = readStringValue(source.directionId, 128);
  const title = readStringValue(source.title, 120);
  if (!directionId || !title) {
    return null;
  }
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

function normalizeInitiationSummary(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const source = value as Record<string, unknown>;
  const projectName = readStringValue(source.projectName, 120);
  if (!projectName) {
    return null;
  }
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

function normalizeTextArray(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => readStringValue(item, 500)).filter(Boolean)
    : [];
}

function normalizeFollowupCycle(value: unknown): FollowupCycle | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const source = value as Record<string, unknown>;
  const cycleNo = Math.max(1, Number(source.cycleNo || 0));
  const tasks = Array.isArray(source.tasks)
    ? source.tasks
      .map((task) => {
        if (!task || typeof task !== "object" || Array.isArray(task)) {
          return null;
        }
        const item = task as Record<string, unknown>;
        const label = readStringValue(item.label, 120);
        return label
          ? {
            id: readStringValue(item.id, 128),
            label,
            taskType: readStringValue(item.taskType, 64) || "validation"
          }
          : null;
      })
      .filter((item): item is { id: string; label: string; taskType: string } => !!item)
    : [];
  if (!cycleNo || !tasks.length) {
    return null;
  }
  const generatedReason = readStringValue(source.generatedReason, 32);
  return {
    cycleNo,
    generatedReason: generatedReason === "manual" || generatedReason === "feedback" || generatedReason === "scheduled"
      ? generatedReason
      : "initiation",
    goal: readStringValue(source.goal, 300),
    tasks: tasks.slice(0, 3),
    successCriteria: normalizeTextArray(source.successCriteria),
    evidenceNeeded: normalizeTextArray(source.evidenceNeeded),
    nextRecommendation: readStringValue(source.nextRecommendation, 500),
    createdAt: readStringValue(source.createdAt, 64) || new Date().toISOString(),
    closedAt: readStringValue(source.closedAt, 64) || undefined
  };
}

function buildDefaultBusinessDirections(seed: string): BusinessDirectionCandidate[] {
  return buildRotatedBusinessDirections(seed);

  return [
    {
      directionId: `${seed}-ai-service`,
      title: "AI 工具落地服务",
      targetUser: "有重复沟通、整理、交付工作的个体老板或小团队",
      corePain: "知道 AI 有用，但不知道如何把日常流程变成可复用工具",
      offerIdea: "帮客户把一个高频工作流改造成 AI 助手或自动化模板",
      monetizationPath: "按单次诊断 + 小型搭建包收费，后续转维护或模板复用",
      whyFitUser: "适合利用你的经验、表达能力和对业务流程的理解快速拿到反馈",
      estimatedTimeToFirstSignal: "3-7 天",
      validationCost: "低：先用访谈和原型截图验证",
      executionDifficulty: "中",
      firstValidationStep: "找 3 个熟人或潜在客户，问他们最想自动化的一个重复环节",
      killSignal: "连续 5 个目标客户都说这是锦上添花且不愿付费"
    },
    {
      directionId: `${seed}-ip-product`,
      title: "个人 IP 产品化陪跑",
      targetUser: "有专业经验但不会把经验包装成产品的人",
      corePain: "会做事，但讲不清卖点、产品包和第一批获客动作",
      offerIdea: "把能力梳理成一个入门服务包、一套内容选题和首轮触达脚本",
      monetizationPath: "低价诊断切入，升级为 7-14 天陪跑包",
      whyFitUser: "与资产盘点和机会识别主线一致，容易从对话沉淀成标准方法",
      estimatedTimeToFirstSignal: "1 周内",
      validationCost: "低：用 1 页方案和 10 个触达验证",
      executionDifficulty: "中低",
      firstValidationStep: "约 3 个有专业技能但没产品的人，验证是否愿意为打包方案付费",
      killSignal: "对方只想免费咨询，不愿为清晰方案或陪跑付任何小额费用"
    },
    {
      directionId: `${seed}-micro-consulting`,
      title: "轻量商业体检顾问",
      targetUser: "已经有收入但增长混乱的小微生意主",
      corePain: "收入、定价、获客和交付都在跑，但没有结构化复盘和下一步优先级",
      offerIdea: "用一次 60 分钟体检输出收入结构、定价问题和 3 天行动清单",
      monetizationPath: "按次体检收费，后续转月度复盘或管家服务",
      whyFitUser: "能承接后续管家、财税、园区和自动化模块",
      estimatedTimeToFirstSignal: "3 天内",
      validationCost: "中低：需要真实业务数据或访谈",
      executionDifficulty: "中",
      firstValidationStep: "找 2 个已有生意的人做一次免费/低价体检，记录他们愿意继续付费的部分",
      killSignal: "客户无法提供数据，且只想泛泛聊天不愿进入具体动作"
    }
  ];
}

function buildRotatedBusinessDirections(seed: string): BusinessDirectionCandidate[] {
  const directionSets: Array<Array<Omit<BusinessDirectionCandidate, "directionId"> & { slug: string }>> = [
    [
      {
        slug: "ai-service",
        title: "AI 工具落地服务",
        targetUser: "有重复沟通、整理、交付工作的个体老板或小团队",
        corePain: "知道 AI 有用，但不知道如何把日常流程变成可复用工具",
        offerIdea: "帮客户把一个高频工作流改造成 AI 助手或自动化模板",
        monetizationPath: "按单次诊断加小型搭建包收费，后续转维护或模板复用",
        whyFitUser: "适合利用你的经验、表达能力和对业务流程的理解快速拿到反馈",
        estimatedTimeToFirstSignal: "3-7 天",
        validationCost: "低：先用访谈和原型截图验证",
        executionDifficulty: "中",
        firstValidationStep: "找 3 个熟人或潜在客户，问他们最想自动化的一个重复环节",
        killSignal: "连续 5 个目标客户都说这是锦上添花且不愿付费"
      },
      {
        slug: "ip-product",
        title: "个人 IP 产品化陪跑",
        targetUser: "有专业经验但不会把经验包装成产品的人",
        corePain: "会做事，但讲不清卖点、产品包和第一批获客动作",
        offerIdea: "把能力梳理成入门服务包、内容选题和首轮触达脚本",
        monetizationPath: "低价诊断切入，升级为 7-14 天陪跑包",
        whyFitUser: "与资产盘点和机会识别主线一致，容易从对话沉淀成方法",
        estimatedTimeToFirstSignal: "1 周内",
        validationCost: "低：用 1 页方案和 10 个触达验证",
        executionDifficulty: "中低",
        firstValidationStep: "约 3 个有专业技能但没产品的人，验证是否愿意为打包方案付费",
        killSignal: "对方只想免费咨询，不愿为清晰方案或陪跑付任何小额费用"
      },
      {
        slug: "micro-consulting",
        title: "轻量商业体检顾问",
        targetUser: "已经有收入但增长混乱的小微生意主",
        corePain: "收入、定价、获客和交付都在跑，但没有结构化复盘和下一步优先级",
        offerIdea: "用一次 60 分钟体检输出收入结构、定价问题和 3 天行动清单",
        monetizationPath: "按次体检收费，后续转月度复盘或管家服务",
        whyFitUser: "能承接后续管家、财税、园区和自动化模块",
        estimatedTimeToFirstSignal: "3 天内",
        validationCost: "中低：需要真实业务数据或访谈",
        executionDifficulty: "中",
        firstValidationStep: "找 2 个已有生意的人做一次免费或低价体检，记录愿意继续付费的部分",
        killSignal: "客户无法提供数据，且只想泛泛聊天不愿进入具体动作"
      }
    ],
    [
      {
        slug: "local-shop-content",
        title: "本地门店内容增长包",
        targetUser: "有稳定门店但不会持续做内容的老板",
        corePain: "知道要发小红书或抖音，但没人能把门店卖点拆成可执行选题",
        offerIdea: "输出 14 天选题、拍摄清单和门店转化话术",
        monetizationPath: "先卖内容诊断包，再升级月度内容陪跑",
        whyFitUser: "验证快、交付边界清晰，适合小步试单",
        estimatedTimeToFirstSignal: "3 天内",
        validationCost: "低：访谈加样例选题即可",
        executionDifficulty: "中低",
        firstValidationStep: "找 5 家本地门店，给出 3 条免费选题并询问是否愿意买完整包",
        killSignal: "老板只关心代运营结果，不愿为策略和选题单独付费"
      },
      {
        slug: "wechat-private-domain",
        title: "微信私域成交整理师",
        targetUser: "靠微信成交但客户跟进混乱的个人服务者",
        corePain: "客户在微信里聊散了，需求、报价、跟进时间没人整理",
        offerIdea: "帮他设计客户标签、跟进节奏和成交复盘表",
        monetizationPath: "按一次整理收费，后续转工具模板和月度复盘",
        whyFitUser: "和项目跟进能力贴合，容易沉淀成标准流程",
        estimatedTimeToFirstSignal: "1 周内",
        validationCost: "低：看 20 条聊天记录即可判断痛点",
        executionDifficulty: "中",
        firstValidationStep: "找 3 个靠微信成交的人，帮他们免费整理一次客户分层",
        killSignal: "对方不愿提供聊天样本，也不愿改变现有跟进方式"
      },
      {
        slug: "solo-founder-weekly",
        title: "单人创业周复盘服务",
        targetUser: "一个人推进副业或小项目但容易分心的人",
        corePain: "想法很多、执行断续，缺少每周聚焦和外部约束",
        offerIdea: "每周一次复盘，固定输出本周目标、证据和下一步动作",
        monetizationPath: "低价周卡验证，稳定后做月度陪跑",
        whyFitUser: "直接承接你的小程序项目跟进机制",
        estimatedTimeToFirstSignal: "7 天",
        validationCost: "低：用 3 个体验名额验证",
        executionDifficulty: "中低",
        firstValidationStep: "招募 3 个正在做副业的人，提供一次免费周复盘",
        killSignal: "用户连续两周不提交进展，说明付费约束价值不足"
      }
    ],
    [
      {
        slug: "knowledge-base-setup",
        title: "团队知识库搭建顾问",
        targetUser: "3-20 人的小团队负责人",
        corePain: "资料散在微信、飞书和个人脑子里，新人上手慢",
        offerIdea: "帮团队梳理核心知识目录、文档模板和更新机制",
        monetizationPath: "按搭建项目收费，后续做维护和培训",
        whyFitUser: "交付物明确，适合用 AI 和流程工具提高效率",
        estimatedTimeToFirstSignal: "1 周内",
        validationCost: "中：需要一次团队访谈",
        executionDifficulty: "中",
        firstValidationStep: "找 2 个小团队老板，问他们新人最难获得的 3 类信息",
        killSignal: "团队没有资料沉淀意愿，只想临时问人解决"
      },
      {
        slug: "policy-opportunity-digest",
        title: "政策机会解读服务",
        targetUser: "关注补贴、园区和资质机会的小微企业主",
        corePain: "政策太多看不懂，不知道哪条和自己有关",
        offerIdea: "把政策翻译成适配度、材料清单和下一步判断",
        monetizationPath: "按次解读收费，后续转申报前诊断",
        whyFitUser: "能和现有政策/园区能力联动",
        estimatedTimeToFirstSignal: "3-7 天",
        validationCost: "中低：用公开政策和企业画像验证",
        executionDifficulty: "中",
        firstValidationStep: "找 3 个小微企业主，免费判断一条政策是否值得申请",
        killSignal: "用户只想要免费信息，不愿为判断和材料路径付费"
      },
      {
        slug: "ops-automation-audit",
        title: "运营自动化体检",
        targetUser: "有客服、表格、订单或交付流程的小团队",
        corePain: "每天重复复制粘贴、提醒和汇总，但不知道先自动化哪一步",
        offerIdea: "用一次流程体检输出自动化优先级和最小改造方案",
        monetizationPath: "体检收费，后续承接工具搭建",
        whyFitUser: "能快速找到降本增效的可验证场景",
        estimatedTimeToFirstSignal: "3 天内",
        validationCost: "中：需要了解真实流程",
        executionDifficulty: "中",
        firstValidationStep: "访谈 3 个团队负责人，记录每天最浪费时间的重复动作",
        killSignal: "重复动作频率低，自动化节省不了明显时间"
      }
    ]
  ];

  const selectedSet = directionSets[resolveDirectionSetIndex(seed, directionSets.length)] || directionSets[0];
  return selectedSet.map(({ slug, ...direction }) => ({
    ...direction,
    directionId: `${seed}-${slug}`
  }));
}

function resolveDirectionSetIndex(seed: string, setCount: number) {
  const versionMatch = String(seed || "").match(/-(\d+)$/);
  const version = versionMatch ? Number(versionMatch[1]) : 0;
  if (version > 0) {
    return (version - 1) % Math.max(1, setCount);
  }

  return hashSeed(seed) % Math.max(1, setCount);
}

function hashSeed(seed: string) {
  return Array.from(String(seed || "fallback")).reduce((hash, char) => {
    return (hash * 31 + char.charCodeAt(0)) >>> 0;
  }, 7);
}

function buildInitiationSummaryFromDirection(direction: BusinessDirectionCandidate) {
  return {
    projectName: direction.title,
    oneLinePositioning: `${direction.targetUser}的${direction.offerIdea}`,
    targetUser: direction.targetUser,
    coreOffer: direction.offerIdea,
    deliveryMode: "先用轻量诊断或原型验证，再决定是否产品化",
    pricingHypothesis: "首轮以低风险试单价验证付费意愿",
    firstCycleGoal: `验证是否有人愿意为「${direction.title}」付出时间或小额预算`,
    firstCycleTasks: [
      direction.firstValidationStep,
      "整理 3 条客户原话，标记强需求和弱需求",
      "根据反馈判断继续、调整或停止"
    ],
    successCriteria: [
      "至少 3 个目标用户给出具体场景反馈",
      "至少 1 个用户愿意进入下一步演示、报价或试单"
    ],
    killCriteria: [
      direction.killSignal,
      "反馈只停留在礼貌认可，没有具体痛点或下一步"
    ],
    evidenceNeeded: [
      "客户原话",
      "是否愿意付费或投入时间",
      "对价格、交付方式和结果承诺的反应"
    ],
    riskNotes: [
      "先验证需求强度，不急着做完整产品",
      "每轮只追一个最小商业假设"
    ]
  };
}

function buildFollowupCycleFromSummary(
  summary: NonNullable<ReturnType<typeof normalizeInitiationSummary>>,
  cycleNo: number,
  generatedReason: FollowupCycle["generatedReason"]
): FollowupCycle {
  const tasks = (summary.firstCycleTasks.length ? summary.firstCycleTasks : [
    "触达 3 个目标用户",
    "记录 3 条真实反馈",
    "更新一次继续/调整/停止判断"
  ]).slice(0, 3);
  return {
    cycleNo,
    generatedReason,
    goal: summary.firstCycleGoal || "验证本轮商业假设",
    tasks: tasks.map((label, index) => ({
      id: `cycle-${cycleNo}-task-${index + 1}`,
      label,
      taskType: index === 0 ? "validation" : "evidence"
    })),
    successCriteria: summary.successCriteria,
    evidenceNeeded: summary.evidenceNeeded,
    nextRecommendation: "完成本轮反馈后，再决定继续推进、调整定位或退回探索。",
    createdAt: new Date().toISOString()
  };
}

function alignFollowupAt(from: Date, cadenceDays: number) {
  const next = new Date(from);
  next.setDate(next.getDate() + Math.max(1, cadenceDays || 3));
  next.setHours(9, 0, 0, 0);
  return next;
}

function buildStaleResult(project: Pick<Project, "workspaceVersion">) {
  return {
    stale: true,
    message: "Current workspace has changed. Please refresh and confirm again.",
    currentWorkspaceVersion: Number(project.workspaceVersion || 1)
  };
}

async function upsertArtifact(
  tx: Prisma.TransactionClient,
  projectId: string,
  artifact: {
    type: string;
    versionScope: string;
    title: string;
    data: Record<string, unknown>;
    summary?: string;
  }
) {
  const existing = await tx.projectArtifact.findFirst({
    where: {
      projectId,
      type: artifact.type,
      versionScope: artifact.versionScope,
      deletedAt: null
    },
    orderBy: { updatedAt: "desc" }
  });
  const data = {
    title: artifact.title,
    data: artifact.data as Prisma.InputJsonValue,
    summary: artifact.summary || null
  };
  if (existing) {
    await tx.projectArtifact.update({
      where: { id: existing.id },
      data
    });
    return;
  }
  await tx.projectArtifact.create({
    data: {
      id: `artifact-${randomUUID()}`,
      projectId,
      type: artifact.type,
      versionScope: artifact.versionScope,
      ...data
    }
  });
}

async function createFollowupCycleArtifact(
  tx: Prisma.TransactionClient,
  projectId: string,
  cycle: FollowupCycle
) {
  await upsertArtifact(tx, projectId, {
    type: OPPORTUNITY_CANONICAL_ARTIFACT_TYPES.followupCycle,
    versionScope: `cycle-${cycle.cycleNo}`,
    title: `第 ${cycle.cycleNo} 轮跟进`,
    data: {
      artifactVersion: cycle.cycleNo,
      cycle
    },
    summary: cycle.goal
  });
}

async function replaceCycleTasks(
  tx: Prisma.TransactionClient,
  input: {
    userId: string;
    projectId: string;
    projectName: string;
    cycle: FollowupCycle;
  }
) {
  await tx.dailyTask.deleteMany({
    where: {
      userId: input.userId,
      projectId: input.projectId,
      cycleNo: input.cycle.cycleNo
    }
  });
  for (const [index, task] of input.cycle.tasks.entries()) {
    await tx.dailyTask.create({
      data: {
        id: `${input.projectId}-cycle-${input.cycle.cycleNo}-task-${index + 1}`,
        userId: input.userId,
        projectId: input.projectId,
        cycleNo: input.cycle.cycleNo,
        taskType: task.taskType || "validation",
        label: task.label.slice(0, 120),
        tag: input.projectName,
        agentKey: "execution",
        status: "pending",
        done: false
      }
    });
  }
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
