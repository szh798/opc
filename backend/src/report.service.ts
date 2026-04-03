import { Injectable } from "@nestjs/common";
import { Prisma, SnapshotKind } from "@prisma/client";
import { PrismaService } from "./shared/prisma.service";
import {
  DEFAULT_MONTHLY_REPORT,
  DEFAULT_SOCIAL_PROOF,
  DEFAULT_WEEKLY_REPORT
} from "./shared/templates";
import { readJsonObject } from "./shared/json";
import { UserService } from "./user.service";
import { GrowthService } from "./growth.service";
import {
  buildDynamicMonthlyReport,
  buildDynamicSocialProof,
  buildDynamicWeeklyReport,
  collectUserInsights
} from "./shared/user-insights";

@Injectable()
export class ReportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly userService: UserService,
    private readonly growthService: GrowthService
  ) {}

  async getWeeklyReport(userId?: string | null) {
    const user = await this.userService.getUserOrDemo(userId);
    const snapshot = await this.ensureSnapshot(user.id, SnapshotKind.WEEKLY_REPORT, DEFAULT_WEEKLY_REPORT);
    const fallback = readJsonObject(snapshot.data, DEFAULT_WEEKLY_REPORT);
    const insights = await collectUserInsights(this.prisma, user.id);
    const report = {
      ...fallback,
      ...buildDynamicWeeklyReport(insights)
    };

    await this.prisma.reportSnapshot.update({
      where: {
        id: snapshot.id
      },
      data: {
        data: report as Prisma.InputJsonValue
      }
    });

    return report;
  }

  async getMonthlyReport(userId?: string | null) {
    const user = await this.userService.getUserOrDemo(userId);
    const snapshot = await this.ensureSnapshot(user.id, SnapshotKind.MONTHLY_REPORT, DEFAULT_MONTHLY_REPORT);
    const fallback = readJsonObject(snapshot.data, DEFAULT_MONTHLY_REPORT);
    const insights = await collectUserInsights(this.prisma, user.id);
    const report = {
      ...fallback,
      ...buildDynamicMonthlyReport(insights)
    };

    await this.prisma.reportSnapshot.update({
      where: {
        id: snapshot.id
      },
      data: {
        data: report as Prisma.InputJsonValue
      }
    });

    return report;
  }

  async getSocialProof(userId?: string | null) {
    const user = await this.userService.getUserOrDemo(userId);
    const snapshot = await this.ensureSnapshot(user.id, SnapshotKind.SOCIAL_PROOF, DEFAULT_SOCIAL_PROOF);
    const fallback = readJsonObject(snapshot.data, DEFAULT_SOCIAL_PROOF);
    const insights = await collectUserInsights(this.prisma, user.id);
    const report = {
      ...fallback,
      ...buildDynamicSocialProof(insights)
    };

    await this.prisma.reportSnapshot.update({
      where: {
        id: snapshot.id
      },
      data: {
        data: report as Prisma.InputJsonValue
      }
    });

    return report;
  }

  async getCurrentMilestone(userId?: string | null) {
    return this.growthService.getCurrentGrowthMilestone(userId);
  }

  private async ensureSnapshot(
    userId: string,
    kind: SnapshotKind,
    fallback: Record<string, unknown>
  ) {
    let snapshot = await this.prisma.reportSnapshot.findUnique({
      where: {
        userId_kind: {
          userId,
          kind
        }
      }
    });

    if (!snapshot) {
      snapshot = await this.prisma.reportSnapshot.create({
        data: {
          userId,
          kind,
          data: fallback as Prisma.InputJsonValue
        }
      });
    }

    return snapshot;
  }
}
