import { Injectable } from "@nestjs/common";
import { Prisma, SnapshotKind } from "@prisma/client";
import { PrismaService } from "./shared/prisma.service";
import { DEFAULT_PROFILE_DATA } from "./shared/templates";
import { readJsonObject } from "./shared/json";
import { UserService } from "./user.service";
import { buildDynamicProfile, collectUserInsights } from "./shared/user-insights";

@Injectable()
export class ProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly userService: UserService
  ) {}

  async getProfile(userId?: string | null) {
    const user = await this.userService.getUserOrDemo(userId);
    const snapshot = await this.ensureProfileSnapshot(user.id);
    const fallbackProfile = readJsonObject(snapshot.data, DEFAULT_PROFILE_DATA);
    const insights = await collectUserInsights(this.prisma, user.id);
    const profile = buildDynamicProfile(insights, fallbackProfile);
    const nextName = String(user.nickname || user.name || fallbackProfile.name || "小明").trim() || "小明";

    await this.prisma.reportSnapshot.upsert({
      where: {
        userId_kind: {
          userId: user.id,
          kind: SnapshotKind.PROFILE
        }
      },
      create: {
        userId: user.id,
        kind: SnapshotKind.PROFILE,
        data: profile as Prisma.InputJsonValue
      },
      update: {
        data: profile as Prisma.InputJsonValue
      }
    });

    return {
      ...profile,
      name: nextName,
      initial: String(user.initial || nextName.slice(0, 1) || fallbackProfile.initial || "小").trim() || "小",
      avatarUrl: String(user.avatarUrl || fallbackProfile.avatarUrl || "").trim(),
      stageLabel: buildStageLabel(String(user.stage || ""), Number(user.streakDays), String(profile.stageLabel || ""))
    };
  }

  private async ensureProfileSnapshot(userId: string) {
    let snapshot = await this.prisma.reportSnapshot.findUnique({
      where: {
        userId_kind: {
          userId,
          kind: SnapshotKind.PROFILE
        }
      }
    });

    if (!snapshot) {
      snapshot = await this.prisma.reportSnapshot.create({
        data: {
          userId,
          kind: SnapshotKind.PROFILE,
          data: DEFAULT_PROFILE_DATA
        }
      });
    }

    return snapshot;
  }
}

function buildStageLabel(stage: string, streakDays: number, fallback: string) {
  const safeStage = String(stage || "").trim();
  if (!safeStage) {
    return fallback;
  }

  if (Number.isFinite(streakDays) && streakDays > 0) {
    return `${safeStage} · 连续打卡 ${streakDays} 天`;
  }

  return safeStage;
}
