import { Controller, Get, UseGuards } from "@nestjs/common";
import { AccessTokenGuard } from "./auth/access-token.guard";
import { RolesGuard } from "./auth/roles.guard";
import { Roles } from "./auth/roles.decorator";
import { PrismaService } from "./shared/prisma.service";

/**
 * Phase B3 —— 业务指标看板 v0。
 *
 *   计划原定"Metabase / Grafana 接 Postgres"，但在没有 BI 基建之前，
 *   先把 5 张图对应的 SQL 封装成 admin-only REST 端点，保证老板随时能
 *   在浏览器里看到真实数字；后续接 Metabase 时 JSON 直接作为数据源即可。
 *
 *   所有指标都限定在最近 24h / 7d 窗口，避免大表全表扫描。
 *   p95 走原生 SQL 的 PERCENTILE_CONT，Prisma 抽象层不支持分位数。
 */
@Controller("admin/metrics")
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles("admin")
export class AdminMetricsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("overview")
  async getOverview() {
    const now = new Date();
    const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const since7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [dau, firstInventory, reportSuccess, difyP95, topErrors] = await Promise.all([
      this.computeDau(since24h),
      this.computeFirstInventoryCompletionRate(),
      this.computeWorkflowSuccessRate("reportGeneration", since7d),
      this.computeDifyP95Latency(since24h),
      this.computeTopErrors(since24h, 10)
    ]);

    return {
      generatedAt: now.toISOString(),
      windows: {
        dau: "last 24h",
        firstInventoryCompletion: "all-time",
        reportSuccess: "last 7d",
        difyP95: "last 24h (successful calls)",
        topErrors: "last 24h"
      },
      dau,
      firstInventoryCompletion: firstInventory,
      reportSuccess,
      difyP95LatencyMs: difyP95,
      topErrors
    };
  }

  /** DAU：最近 24h 内发过至少一条消息的去重用户数。 */
  private async computeDau(since: Date) {
    const rows = await this.prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(DISTINCT "userId")::bigint AS count
      FROM "Message"
      WHERE "createdAt" >= ${since}
    `;
    return Number(rows[0]?.count ?? 0);
  }

  /**
   * 首盘完成率 = 已完成首轮资产盘点（hasAssetRadar=true）的用户 /
   *              至少发过 1 条消息的用户。
   * 分母用消息存在与否而不是登录与否，是为了滤掉"登录即退出"的噪声。
   */
  private async computeFirstInventoryCompletionRate() {
    const engagedRows = await this.prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(DISTINCT "userId")::bigint AS count FROM "Message"
    `;
    const engaged = Number(engagedRows[0]?.count ?? 0);
    if (engaged === 0) {
      return { engagedUsers: 0, completedUsers: 0, completionRate: 0 };
    }

    const completed = await this.prisma.user.count({
      where: { hasAssetRadar: true }
    });

    return {
      engagedUsers: engaged,
      completedUsers: completed,
      completionRate: engaged === 0 ? 0 : Math.round((completed / engaged) * 10000) / 10000
    };
  }

  /** Dify workflow 成功率：按指定 workflowKey 在时间窗口内算 success / total。 */
  private async computeWorkflowSuccessRate(workflowKey: string, since: Date) {
    const rows = await this.prisma.difyUsageLog.groupBy({
      by: ["status"],
      where: { workflowKey, createdAt: { gte: since } },
      _count: { _all: true }
    });

    let total = 0;
    let success = 0;
    for (const row of rows) {
      const n = row._count?._all || 0;
      total += n;
      if (row.status === "success") success += n;
    }
    return {
      workflowKey,
      total,
      success,
      successRate: total === 0 ? null : Math.round((success / total) * 10000) / 10000
    };
  }

  /**
   * Dify p95 延迟：只统计 success 调用。失败调用大多是超时或 5xx，
   * latencyMs 会被熔断拉高或压低，把它们包含进 p95 反而失真。
   */
  private async computeDifyP95Latency(since: Date) {
    const rows = await this.prisma.$queryRaw<Array<{ p95: number | null; count: bigint }>>`
      SELECT
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY "latencyMs")::float AS p95,
        COUNT(*)::bigint AS count
      FROM "DifyUsageLog"
      WHERE "createdAt" >= ${since} AND "status" = 'success'
    `;
    const row = rows[0];
    return {
      sampleCount: Number(row?.count ?? 0),
      p95Ms: row?.p95 == null ? null : Math.round(row.p95)
    };
  }

  /**
   * Top N 错误：按 source + message 前 120 字符分桶计数，
   * 截断是为了把同一类错误（比如带不同 requestId 的 NotFound）聚起来。
   */
  private async computeTopErrors(since: Date, limit: number) {
    const rows = await this.prisma.$queryRaw<
      Array<{
        source: string;
        messageHead: string;
        count: bigint;
        lastSeen: Date;
      }>
    >`
      SELECT
        "source",
        LEFT("message", 120) AS "messageHead",
        COUNT(*)::bigint AS count,
        MAX("createdAt") AS "lastSeen"
      FROM "ErrorLog"
      WHERE "createdAt" >= ${since}
      GROUP BY "source", LEFT("message", 120)
      ORDER BY count DESC, "lastSeen" DESC
      LIMIT ${limit}
    `;

    return rows.map((row) => ({
      source: row.source,
      messageHead: row.messageHead,
      count: Number(row.count),
      lastSeen: row.lastSeen.toISOString()
    }));
  }
}
