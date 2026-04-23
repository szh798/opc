import { HttpException, HttpStatus, Injectable, Logger } from "@nestjs/common";
import { getAppConfig } from "./app-config";

export type QuotaBucket = "chat_message" | "asset_inventory" | "asset_report";

type BucketConfig = {
  limit: number;
  label: string;
};

type CounterEntry = {
  dayKey: string;
  count: number;
};

/**
 * Phase A3：per-user 每日业务配额。
 *
 * 实现选择：in-memory Map。
 *   优点：零依赖、无外部 IO、与 Fastify rate-limit 一致。
 *   取舍：进程重启丢计数；多实例部署下每个实例独立计数，用户能叠加到 N×额度。
 *   这在 4/30 单机上线时是可接受的折衷。后续 Phase F 多实例化时，换 Redis。
 *
 * 日窗口按"北京时间自然日"（UTC+8）滚动，和发布预检 / 看板使用的窗口一致。
 */
@Injectable()
export class QuotaService {
  private readonly logger = new Logger(QuotaService.name);
  private readonly config = getAppConfig();

  private readonly counters = new Map<string, CounterEntry>();

  private getBucketConfig(bucket: QuotaBucket): BucketConfig {
    switch (bucket) {
      case "chat_message":
        return { limit: this.config.quotaChatMessagesPerDay, label: "每日对话消息" };
      case "asset_inventory":
        return { limit: this.config.quotaAssetInventoryPerDay, label: "每日资产盘点" };
      case "asset_report":
        return { limit: this.config.quotaAssetReportPerDay, label: "每日资产报告生成" };
    }
  }

  async consumeChatMessage(userId: string) {
    return this.consume(userId, "chat_message");
  }

  async consumeAssetInventoryAttempt(userId: string) {
    return this.consume(userId, "asset_inventory");
  }

  async consumeAssetReport(userId: string) {
    return this.consume(userId, "asset_report");
  }

  /**
   * 消费一次配额。超限抛 HTTP 429。
   * 返回当前 window 内剩余额度，方便调用方附加到响应 header。
   */
  async consume(userId: string, bucket: QuotaBucket): Promise<{ remaining: number; limit: number }> {
    const normalized = String(userId || "").trim();
    if (!normalized) {
      // 匿名请求一律不计入配额，让上层鉴权去处理
      const { limit } = this.getBucketConfig(bucket);
      return { remaining: limit, limit };
    }

    const { limit, label } = this.getBucketConfig(bucket);
    const dayKey = this.currentDayKey();
    const counterKey = `${bucket}:${normalized}`;

    const existing = this.counters.get(counterKey);
    const current = existing && existing.dayKey === dayKey ? existing.count : 0;

    if (current >= limit) {
      throw new HttpException(
        {
          code: "QUOTA_EXCEEDED",
          message: `${label}已达上限（${limit} 次/日），请明日再试`,
          bucket,
          limit,
          remaining: 0,
          resetAt: this.nextResetAtIso()
        },
        HttpStatus.TOO_MANY_REQUESTS
      );
    }

    const nextCount = current + 1;
    this.counters.set(counterKey, { dayKey, count: nextCount });
    this.gcIfNeeded();
    return { remaining: Math.max(0, limit - nextCount), limit };
  }

  /**
   * 只看不减（用于 /user/quota 类查询，当前未暴露接口，保留备用）。
   */
  peek(userId: string, bucket: QuotaBucket) {
    const { limit } = this.getBucketConfig(bucket);
    const normalized = String(userId || "").trim();
    if (!normalized) return { used: 0, remaining: limit, limit };
    const existing = this.counters.get(`${bucket}:${normalized}`);
    const dayKey = this.currentDayKey();
    const used = existing && existing.dayKey === dayKey ? existing.count : 0;
    return { used, remaining: Math.max(0, limit - used), limit };
  }

  /** 测试用：清空所有计数 */
  reset() {
    this.counters.clear();
  }

  private currentDayKey() {
    // UTC+8 的 YYYY-MM-DD
    const now = new Date(Date.now() + 8 * 60 * 60 * 1000);
    return now.toISOString().slice(0, 10);
  }

  private nextResetAtIso() {
    // 下一个 UTC+8 00:00
    const now = new Date(Date.now() + 8 * 60 * 60 * 1000);
    const nextDay = new Date(now);
    nextDay.setUTCHours(24, 0, 0, 0);
    return new Date(nextDay.getTime() - 8 * 60 * 60 * 1000).toISOString();
  }

  private gcIfNeeded() {
    if (this.counters.size < 5000) return;
    const dayKey = this.currentDayKey();
    for (const [key, entry] of this.counters.entries()) {
      if (entry.dayKey !== dayKey) this.counters.delete(key);
    }
  }
}
