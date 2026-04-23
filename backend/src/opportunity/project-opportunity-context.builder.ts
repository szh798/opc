import { Injectable } from "@nestjs/common";
import { PrismaService } from "../shared/prisma.service";
import { OpportunityService } from "./opportunity.service";

@Injectable()
export class ProjectOpportunityContextBuilder {
  constructor(
    private readonly prisma: PrismaService,
    private readonly opportunityService: OpportunityService
  ) {}

  async buildInputs(input: {
    userId: string;
    projectId?: string;
    allowCreate?: boolean;
  }) {
    let project = input.projectId
      ? await this.prisma.project.findFirst({
          where: {
            id: input.projectId,
            userId: input.userId,
            deletedAt: null
          }
        })
      : await this.opportunityService.getFocusProject(input.userId);

    if (!project && input.allowCreate) {
      project = await this.opportunityService.ensureOpportunityProject(input.userId);
    }

    if (!project) {
      return {
        projectId: "",
        inputs: {} as Record<string, unknown>
      };
    }

    const [artifacts, tasks, projectMessages] = await Promise.all([
      this.prisma.projectArtifact.findMany({
        where: {
          projectId: project.id,
          deletedAt: null,
          versionScope: "current"
        },
        orderBy: {
          updatedAt: "desc"
        },
        take: 6
      }),
      this.prisma.dailyTask.findMany({
        where: {
          userId: input.userId,
          projectId: project.id
        },
        orderBy: {
          updatedAt: "desc"
        },
        take: 5
      }),
      this.prisma.taskFeedback.findMany({
        where: {
          userId: input.userId
        },
        orderBy: {
          createdAt: "desc"
        },
        take: 20
      })
    ]);

    const taskIdSet = new Set(tasks.map((item) => String(item.id || "").trim()).filter(Boolean));
    const recentFeedback = projectMessages
      .filter((item) => taskIdSet.has(String(item.taskId || "").trim()))
      .slice(0, 5)
      .map((item) => ({
        taskId: item.taskId || "",
        taskLabel: item.taskLabel || "",
        summary: item.summary || "",
        advice: item.advice || "",
        createdAt: item.createdAt.toISOString()
      }));

    const recentArtifacts = artifacts.map((artifact) => ({
      type: artifact.type,
      title: artifact.title,
      summary: artifact.summary || "",
      updatedAt: artifact.updatedAt.toISOString()
    }));

    const summary = this.opportunityService.buildProjectOpportunitySummary(project);
    const contextPayload = {
      project_name: summary.projectName,
      opportunity_stage: summary.opportunityStage,
      decision_status: summary.decisionStatus,
      opportunity_snapshot: summary.opportunitySnapshot,
      opportunity_score: summary.opportunityScore || {},
      last_validation_signal: summary.lastValidationSignal,
      next_validation_action: summary.nextValidationAction,
      recent_artifacts: recentArtifacts,
      recent_feedback: recentFeedback
    };

    return {
      projectId: project.id,
      inputs: {
        project_name: summary.projectName,
        opportunity_stage: summary.opportunityStage,
        decision_status: summary.decisionStatus,
        opportunity_snapshot: toPrettyJsonString(summary.opportunitySnapshot),
        opportunity_score: toPrettyJsonString(summary.opportunityScore || {}),
        last_validation_signal: summary.lastValidationSignal,
        next_validation_action: summary.nextValidationAction,
        recent_artifacts: toPrettyJsonString(recentArtifacts),
        recent_feedback: toPrettyJsonString(recentFeedback),
        project_opportunity_context: toPrettyJsonString(contextPayload)
      }
    };
  }
}

function toPrettyJsonString(value: unknown) {
  try {
    return JSON.stringify(value || {}, null, 2);
  } catch (_error) {
    return "{}";
  }
}
