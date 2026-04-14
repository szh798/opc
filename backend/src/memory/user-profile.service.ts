import { Injectable, Logger } from "@nestjs/common";
import { Prisma, UserFactDimension, UserProfileType } from "@prisma/client";
import { getAppConfig } from "../shared/app-config";
import { PrismaService } from "../shared/prisma.service";

/**
 * Phase 1.6 —— L3 聚合画像（asset_radar 等）
 * 对齐 abundant-forging-papert.md §3.4 user_profiles
 *
 * 当前只实现 asset_radar：按 UserFactDimension（capability/resource/cognition/relationship）
 * 聚合活跃事实的数量 + 平均 confidence，归一化到 0-100 的分数。
 *
 * 写入方式：新版本插入，旧版本 isCurrent=false，version+1。
 * 调用方式：fire-and-forget，通常由 ChatflowSummaryService 在摘要写完后级联触发。
 */

const MAX_FACTS_PER_DIMENSION = 15; // 归一化上限：15 条事实 ≈ 满分
const MIN_SCORE_PER_FACT = 5;        // 每条事实至少贡献的分数（避免稀疏时画像全 0）

const DIMENSION_LABELS: Record<UserFactDimension, string> = {
  capability: "能力",
  resource: "资源",
  cognition: "认知",
  relationship: "关系"
};

@Injectable()
export class UserProfileService {
  private readonly logger = new Logger(UserProfileService.name);
  private readonly config = getAppConfig();

  constructor(private readonly prisma: PrismaService) {}

  /**
   * fire-and-forget：触发 asset_radar 重算。
   */
  recomputeAsync(userId: string): void {
    if (!this.config.userProfileRecomputeEnabled) return;
    if (!userId) return;

    setImmediate(() => {
      this.recomputeAssetRadar(userId).catch((err) => {
        this.logger.warn(
          `user profile recompute failed userId=${userId}: ${err?.message || err}`
        );
      });
    });
  }

  /**
   * 同步读当前画像。前端接口（如雷达图 API）可以直接调。
   */
  async getCurrentProfile(userId: string, profileType: UserProfileType) {
    return this.prisma.userProfile.findFirst({
      where: { userId, profileType, isCurrent: true },
      orderBy: { version: "desc" }
    });
  }

  // ——————————————————————————————————————————
  // asset_radar 聚合
  // ——————————————————————————————————————————

  private async recomputeAssetRadar(userId: string): Promise<void> {
    const started = Date.now();
    const facts = await this.prisma.userFact.findMany({
      where: {
        userId,
        isActive: true,
        dimension: { not: null }
      },
      select: {
        dimension: true,
        confidence: true,
        factKey: true,
        factValue: true
      }
    });

    if (facts.length === 0) {
      this.logger.debug(`profile=empty userId=${userId}`);
      return;
    }

    type Agg = { count: number; sumConfidence: number; samples: string[] };
    const buckets = new Map<UserFactDimension, Agg>();
    for (const fact of facts) {
      if (!fact.dimension) continue;
      const agg = buckets.get(fact.dimension) || { count: 0, sumConfidence: 0, samples: [] };
      agg.count += 1;
      agg.sumConfidence += fact.confidence;
      if (agg.samples.length < 3) {
        agg.samples.push(fact.factValue.slice(0, 40));
      }
      buckets.set(fact.dimension, agg);
    }

    const dimensionsOrder: UserFactDimension[] = ["capability", "resource", "cognition", "relationship"];
    const dimensions = dimensionsOrder.map((dim) => {
      const agg = buckets.get(dim);
      if (!agg) {
        return { dimension: dim, label: DIMENSION_LABELS[dim], score: 0, factCount: 0, samples: [] };
      }
      const avgConfidence = agg.sumConfidence / agg.count;
      const densityScore = Math.min(1, agg.count / MAX_FACTS_PER_DIMENSION);
      // 综合分 = 数量密度 * 置信度，再加一个小的基础分，归一到 0-100
      const raw = (densityScore * 0.7 + avgConfidence * 0.3) * 100;
      const floor = Math.min(MIN_SCORE_PER_FACT * agg.count, 30);
      const score = Math.max(Math.round(raw), floor);
      return {
        dimension: dim,
        label: DIMENSION_LABELS[dim],
        score: Math.min(score, 100),
        factCount: agg.count,
        samples: agg.samples
      };
    });

    const profileData = {
      dimensions,
      totalFactCount: facts.length,
      generatedAt: new Date().toISOString()
    };

    await this.persist(userId, UserProfileType.asset_radar, profileData as unknown as Prisma.InputJsonValue, facts.length);

    this.logger.log(
      `profile=ok userId=${userId} type=asset_radar facts=${facts.length} ms=${Date.now() - started}`
    );
  }

  private async persist(
    userId: string,
    profileType: UserProfileType,
    profileData: Prisma.InputJsonValue,
    sourceFactCount: number
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const current = await tx.userProfile.findFirst({
        where: { userId, profileType, isCurrent: true },
        orderBy: { version: "desc" }
      });

      const nextVersion = (current?.version || 0) + 1;
      if (current) {
        await tx.userProfile.update({
          where: { id: current.id },
          data: { isCurrent: false }
        });
      }

      await tx.userProfile.create({
        data: {
          userId,
          profileType,
          profileData,
          sourceFactCount,
          isCurrent: true,
          version: nextVersion
        }
      });
    }, {
      timeout: 5000,
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted
    });
  }
}
