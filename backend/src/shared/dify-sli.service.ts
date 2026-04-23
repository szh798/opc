import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { PrismaService } from "./prisma.service";
import { getAppConfig } from "./app-config";
import { ErrorReportService } from "./error-report.service";

/**
 * Phase B5 —— Dify 可用率 SLI。
 *
 *   - 每 5 分钟扫描一次 DifyUsageLog，统计上一个 5 分钟窗口内的
 *     成功/失败比例；低于阈值就打 error 日志并上报一条 Sentry/ErrorLog。
 *   - 只做"发现"，不做"自愈"。重试/降级是 F2 的事；这里的目标是
 *     让值班人在 5 分钟内知道 Dify 出事了，而不是等用户反馈。
 *   - 样本太小（< minSample）会被忽略，避免深夜零星一个失败就触发告警。
 *   - 每个窗口最多只告警一次（用 in-memory Map 去重，进程重启就重置；
 *     cron 本身幂等，告警稍微多一次比少报一次更能被接受）。
 */
@Injectable()
export class DifySliService {
  private readonly logger = new Logger(DifySliService.name);
  private readonly config = getAppConfig();
  private readonly windowMs = 5 * 60 * 1000;
  private readonly minSample = 5;
  private readonly threshold = 0.95;
  private readonly alertedWindows = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly errorReport: ErrorReportService
  ) {}

  /** 每 5 分钟在第 30 秒触发一次，避开整点的其他 cron。 */
  @Cron("30 */5 * * * *", { name: "dify-sli-watch" })
  async evaluate(): Promise<void> {
    try {
      const now = Date.now();
      const windowEnd = Math.floor(now / this.windowMs) * this.windowMs;
      const windowStart = windowEnd - this.windowMs;

      const result = await this.aggregate(new Date(windowStart), new Date(windowEnd));
      if (!result) return;

      const { total, failed, perWorkflow } = result;
      if (total < this.minSample) {
        this.logger.debug(
          `dify-sli: window ${new Date(windowStart).toISOString()} sample=${total} below minSample(${this.minSample}), skip`
        );
        return;
      }

      const successRate = (total - failed) / total;
      const windowKey = `${windowStart}`;
      const breakdown = perWorkflow
        .map((r) => `${r.workflowKey}=${r.failed}/${r.total}`)
        .join(",");

      this.logger.log(
        `dify-sli: window=${new Date(windowStart).toISOString()} total=${total} failed=${failed} successRate=${successRate.toFixed(4)} ${breakdown}`
      );

      if (successRate < this.threshold && !this.alertedWindows.has(windowKey)) {
        this.alertedWindows.set(windowKey, now);
        this.pruneAlertedWindows(now);

        const message = `Dify availability SLI breached: ${(successRate * 100).toFixed(1)}% over last 5m (threshold ${(this.threshold * 100).toFixed(0)}%)`;
        this.logger.error(message);
        this.errorReport.record({
          source: "server",
          level: "error",
          message,
          route: "/__sli__/dify",
          context: {
            windowStart: new Date(windowStart).toISOString(),
            windowEnd: new Date(windowEnd).toISOString(),
            total,
            failed,
            successRate,
            perWorkflow
          }
        });
      }
    } catch (err) {
      this.logger.warn(
        `dify-sli: evaluate failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  private async aggregate(from: Date, to: Date) {
    const rows = await this.prisma.difyUsageLog.groupBy({
      by: ["workflowKey", "status"],
      where: { createdAt: { gte: from, lt: to } },
      _count: { _all: true }
    });

    if (rows.length === 0) return null;

    const byWorkflow = new Map<string, { total: number; failed: number }>();
    let total = 0;
    let failed = 0;
    for (const row of rows) {
      const n = row._count?._all || 0;
      const entry = byWorkflow.get(row.workflowKey) || { total: 0, failed: 0 };
      entry.total += n;
      if (row.status !== "success") entry.failed += n;
      byWorkflow.set(row.workflowKey, entry);
      total += n;
      if (row.status !== "success") failed += n;
    }

    return {
      total,
      failed,
      perWorkflow: Array.from(byWorkflow.entries()).map(([workflowKey, stats]) => ({
        workflowKey,
        ...stats
      }))
    };
  }

  /** 只保留最近 2 小时的告警记录，防止 Map 无限增长。 */
  private pruneAlertedWindows(now: number) {
    const cutoff = now - 2 * 60 * 60 * 1000;
    for (const [key, ts] of this.alertedWindows) {
      if (ts < cutoff) this.alertedWindows.delete(key);
    }
  }
}
