import { Injectable, Logger } from "@nestjs/common";
import { RouterAgentKey, SnapshotKind } from "@prisma/client";
import { GrowthService } from "./growth.service";
import { ProfileService } from "./profile.service";
import { ReportService } from "./report.service";
import { readJsonObject } from "./shared/json";
import { PrismaService } from "./shared/prisma.service";
import {
  DEFAULT_CURRENT_MILESTONE,
  DEFAULT_GROWTH_OVERVIEW,
  DEFAULT_MONTHLY_REPORT,
  DEFAULT_PROFILE_DATA,
  DEFAULT_WEEKLY_REPORT
} from "./shared/templates";
import { getAppConfig } from "./shared/app-config";
import { UserService } from "./user.service";

type SnapshotSource = {
  channel: "chat" | "router";
  agentKey: RouterAgentKey | null;
};

type UpdatedAtMap = {
  profile: string | null;
  weekly_report: string | null;
  monthly_report: string | null;
  growth_snapshot: string | null;
  milestone: string | null;
};

type SnapshotBuildResult = {
  inputs: Record<string, unknown>;
  updatedAtMap: UpdatedAtMap;
  missingSections: string[];
};

type SnapshotBundle = {
  profile: {
    data: Record<string, unknown>;
    updatedAt: Date | null;
  } | null;
  weeklyReport: {
    data: Record<string, unknown>;
    updatedAt: Date | null;
  } | null;
  monthlyReport: {
    data: Record<string, unknown>;
    updatedAt: Date | null;
  } | null;
  growthOverview: {
    data: Record<string, unknown>;
    updatedAt: Date | null;
  } | null;
  milestone: {
    data: Record<string, unknown>;
    updatedAt: Date | null;
  } | null;
};

@Injectable()
export class DifySnapshotContextService {
  private readonly logger = new Logger(DifySnapshotContextService.name);
  private readonly config = getAppConfig();

  constructor(
    private readonly prisma: PrismaService,
    private readonly userService: UserService,
    private readonly profileService: ProfileService,
    private readonly reportService: ReportService,
    private readonly growthService: GrowthService
  ) {}

  async buildSnapshotInputs(userId: string, source: SnapshotSource): Promise<SnapshotBuildResult> {
    const user = await this.userService.getUserOrDemo(userId);
    const initial = await this.loadSnapshots(userId);
    await this.refreshStaleSnapshots(userId, initial);
    const snapshots = await this.loadSnapshots(userId);

    const updatedAtMap: UpdatedAtMap = {
      profile: toIsoString(snapshots.profile?.updatedAt ?? null),
      weekly_report: toIsoString(snapshots.weeklyReport?.updatedAt ?? null),
      monthly_report: toIsoString(snapshots.monthlyReport?.updatedAt ?? null),
      growth_snapshot: toIsoString(snapshots.growthOverview?.updatedAt ?? null),
      milestone: toIsoString(snapshots.milestone?.updatedAt ?? null)
    };

    const missingSections: string[] = [];
    const snapshotMeta = {
      ttl_minutes: this.config.difySnapshotTtlMinutes,
      source_channel: source.channel,
      source_agent: source.agentKey,
      missing: missingSections,
      updated_at: updatedAtMap
    };
    const inputs: Record<string, unknown> = {
      context_version: "snapshot_inputs_v1",
      context_refreshed_at: new Date().toISOString(),
      snapshot_meta: ""
    };

    if (snapshots.profile) {
      inputs.user_profile = toPrettyJsonString(buildUserProfileInput(user, snapshots.profile.data));
    } else {
      missingSections.push("user_profile");
    }

    if (snapshots.weeklyReport) {
      inputs.weekly_report = toPrettyJsonString(buildWeeklyReportInput(snapshots.weeklyReport.data));
    } else {
      missingSections.push("weekly_report");
    }

    if (snapshots.monthlyReport) {
      inputs.monthly_report = toPrettyJsonString(buildMonthlyReportInput(snapshots.monthlyReport.data));
    } else {
      missingSections.push("monthly_report");
    }

    if (snapshots.growthOverview && snapshots.milestone) {
      inputs.growth_context = toPrettyJsonString(
        buildGrowthContextInput(snapshots.growthOverview.data, snapshots.milestone.data)
      );
    } else {
      missingSections.push("growth_context");
    }

    inputs.snapshot_meta = toPrettyJsonString(snapshotMeta);

    return {
      inputs,
      updatedAtMap,
      missingSections
    };
  }

  private async refreshStaleSnapshots(userId: string, snapshots: SnapshotBundle) {
    const tasks: Array<{ label: string; run: () => Promise<unknown> }> = [];

    if (!snapshots.profile || this.isExpired(snapshots.profile.updatedAt)) {
      tasks.push({
        label: "profile",
        run: () => this.profileService.getProfile(userId)
      });
    }

    if (!snapshots.weeklyReport || this.isExpired(snapshots.weeklyReport.updatedAt)) {
      tasks.push({
        label: "weekly_report",
        run: () => this.reportService.getWeeklyReport(userId)
      });
    }

    if (!snapshots.monthlyReport || this.isExpired(snapshots.monthlyReport.updatedAt)) {
      tasks.push({
        label: "monthly_report",
        run: () => this.reportService.getMonthlyReport(userId)
      });
    }

    if (
      !snapshots.growthOverview ||
      this.isExpired(snapshots.growthOverview.updatedAt) ||
      !snapshots.milestone ||
      this.isExpired(snapshots.milestone.updatedAt)
    ) {
      tasks.push({
        label: "growth_context",
        run: () => this.growthService.getGrowthTree(userId)
      });
    }

    const settled = await Promise.allSettled(tasks.map((task) => task.run()));
    settled.forEach((result, index) => {
      if (result.status === "rejected") {
        this.logger.warn(`Failed to refresh snapshot section ${tasks[index].label}: ${resolveErrorMessage(result.reason)}`);
      }
    });
  }

  private async loadSnapshots(userId: string): Promise<SnapshotBundle> {
    const [reportSnapshots, growthSnapshot] = await Promise.all([
      this.prisma.reportSnapshot.findMany({
        where: {
          userId,
          kind: {
            in: [
              SnapshotKind.PROFILE,
              SnapshotKind.WEEKLY_REPORT,
              SnapshotKind.MONTHLY_REPORT,
              SnapshotKind.MILESTONE
            ]
          }
        }
      }),
      this.prisma.growthSnapshot.findUnique({
        where: {
          userId
        }
      })
    ]);

    const reportByKind = reportSnapshots.reduce<Partial<Record<SnapshotKind, { data: unknown; updatedAt: Date }>>>(
      (acc, snapshot) => {
        acc[snapshot.kind] = {
          data: snapshot.data,
          updatedAt: snapshot.updatedAt
        };
        return acc;
      },
      {}
    );

    const profile = reportByKind[SnapshotKind.PROFILE]
      ? {
          data: readJsonObject(reportByKind[SnapshotKind.PROFILE]?.data, DEFAULT_PROFILE_DATA),
          updatedAt: reportByKind[SnapshotKind.PROFILE]?.updatedAt || null
        }
      : null;
    const weeklyReport = reportByKind[SnapshotKind.WEEKLY_REPORT]
      ? {
          data: readJsonObject(reportByKind[SnapshotKind.WEEKLY_REPORT]?.data, DEFAULT_WEEKLY_REPORT),
          updatedAt: reportByKind[SnapshotKind.WEEKLY_REPORT]?.updatedAt || null
        }
      : null;
    const monthlyReport = reportByKind[SnapshotKind.MONTHLY_REPORT]
      ? {
          data: readJsonObject(reportByKind[SnapshotKind.MONTHLY_REPORT]?.data, DEFAULT_MONTHLY_REPORT),
          updatedAt: reportByKind[SnapshotKind.MONTHLY_REPORT]?.updatedAt || null
        }
      : null;
    const growthOverview = growthSnapshot
      ? {
          data: readJsonObject(growthSnapshot.overview, DEFAULT_GROWTH_OVERVIEW),
          updatedAt: growthSnapshot.updatedAt
        }
      : null;
    const milestoneSource = reportByKind[SnapshotKind.MILESTONE]?.data ?? growthSnapshot?.currentMilestone;
    const milestone = milestoneSource
      ? {
          data: readJsonObject(milestoneSource, DEFAULT_CURRENT_MILESTONE),
          updatedAt: reportByKind[SnapshotKind.MILESTONE]?.updatedAt || growthSnapshot?.updatedAt || null
        }
      : null;

    return {
      profile,
      weeklyReport,
      monthlyReport,
      growthOverview,
      milestone
    };
  }

  private isExpired(updatedAt: Date | null) {
    if (!(updatedAt instanceof Date)) {
      return true;
    }

    return Date.now() - updatedAt.getTime() >= this.config.difySnapshotTtlMinutes * 60 * 1000;
  }
}

function buildUserProfileInput(
  user: { id: string; nickname: string; name: string },
  profile: Record<string, unknown>
) {
  const traits = Array.isArray(profile.traits)
    ? profile.traits
        .map((item) => {
          if (!item || typeof item !== "object" || Array.isArray(item)) {
            return null;
          }

          const record = item as Record<string, unknown>;
          return {
            label: String(record.label || "").trim(),
            tone: String(record.tone || "").trim()
          };
        })
        .filter((item): item is { label: string; tone: string } => !!item && !!item.label)
    : [];

  const radar = Array.isArray(profile.radar)
    ? profile.radar
        .map((item) => {
          if (!item || typeof item !== "object" || Array.isArray(item)) {
            return null;
          }

          const record = item as Record<string, unknown>;
          return {
            label: String(record.label || "").trim(),
            value: Number(record.value || 0)
          };
        })
        .filter((item): item is { label: string; value: number } => !!item && !!item.label)
    : [];

  return {
    user_id: user.id,
    display_name: String(user.nickname || user.name || "").trim() || "访客",
    stage_label: String(profile.stageLabel || "").trim(),
    byline: String(profile.byline || "").trim(),
    growth_summary: String(profile.growthSummary || "").trim(),
    strengths: Array.isArray(profile.strengths)
      ? profile.strengths.map((item) => String(item || "").trim()).filter(Boolean)
      : [],
    radar,
    traits,
    ikigai: String(profile.ikigai || "").trim()
  };
}

function buildWeeklyReportInput(report: Record<string, unknown>) {
  return {
    period: String(report.period || "").trim(),
    headline: String(report.headline || "").trim(),
    stats: normalizeKeyedRows(report.stats, ["label", "value", "extra", "tone"]),
    comment: String(report.comment || "").trim(),
    comparison: String(report.comparison || "").trim(),
    primary_text: String(report.primaryText || "").trim()
  };
}

function buildMonthlyReportInput(report: Record<string, unknown>) {
  return {
    title: String(report.title || "").trim(),
    intro: String(report.intro || "").trim(),
    metrics: normalizeKeyedRows(report.metrics, ["label", "value", "accent", "tone"]),
    advice: String(report.advice || "").trim(),
    primary_text: String(report.primaryText || "").trim()
  };
}

function buildGrowthContextInput(overview: Record<string, unknown>, milestone: Record<string, unknown>) {
  return {
    overview: {
      title: String(overview.title || "").trim(),
      phase: String(overview.phase || "").trim(),
      progress_label: String(overview.progressLabel || "").trim(),
      hint: String(overview.hint || "").trim(),
      cta_text: String(overview.ctaText || "").trim()
    },
    current_milestone: {
      title: String(milestone.title || "").trim(),
      unlocked: String(milestone.unlocked || "").trim(),
      copy: String(milestone.copy || "").trim(),
      followup: String(milestone.followup || "").trim(),
      primary_text: String(milestone.primaryText || "").trim(),
      secondary_text: String(milestone.secondaryText || "").trim()
    }
  };
}

function normalizeKeyedRows(value: unknown, fields: string[]) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return null;
      }

      const record = item as Record<string, unknown>;
      const next: Record<string, string> = {};
      fields.forEach((field) => {
        const raw = record[field];
        if (raw === undefined || raw === null) {
          return;
        }

        const normalizedField = field.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`);
        const text = String(raw).trim();
        if (text) {
          next[normalizedField] = text;
        }
      });

      return Object.keys(next).length ? next : null;
    })
    .filter((item): item is Record<string, string> => !!item);
}

function toIsoString(value: Date | null) {
  if (!(value instanceof Date)) {
    return null;
  }

  return value.toISOString();
}

function toPrettyJsonString(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "{}";
  }
}

function resolveErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error || "unknown_error");
}
