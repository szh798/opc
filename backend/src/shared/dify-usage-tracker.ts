import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "./prisma.service";

export type DifyUsageRecord = {
  userId?: string | null;
  workflowKey: string;
  apiKeyTag: string;
  conversationId?: string | null;
  messageId?: string | null;
  status: "success" | "failure";
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  latencyMs: number;
  costCents?: number;
  errorCode?: string;
  errorMessage?: string;
};

/**
 * Phase A4：Dify 调用用量追踪。
 *
 * 记录写入采用 fire-and-forget：调用方不必 await，失败只打 warn 日志，
 * 不能让"统计写库失败"拖慢真正的业务响应。后续 Phase B 的看板与 A3 配额
 * 都可直接查这张表。
 */
@Injectable()
export class DifyUsageTracker {
  private readonly logger = new Logger(DifyUsageTracker.name);

  constructor(private readonly prisma: PrismaService) {}

  record(entry: DifyUsageRecord): void {
    const row = {
      userId: entry.userId ? String(entry.userId).slice(0, 64) : null,
      workflowKey: String(entry.workflowKey || "unknown").slice(0, 64),
      apiKeyTag: String(entry.apiKeyTag || "__default__").slice(0, 64),
      conversationId: entry.conversationId ? String(entry.conversationId).slice(0, 128) : null,
      messageId: entry.messageId ? String(entry.messageId).slice(0, 128) : null,
      status: entry.status,
      promptTokens: normalizeNonNegative(entry.promptTokens),
      completionTokens: normalizeNonNegative(entry.completionTokens),
      totalTokens: normalizeNonNegative(entry.totalTokens),
      latencyMs: normalizeNonNegative(entry.latencyMs),
      costCents: normalizeNonNegative(entry.costCents),
      errorCode: entry.errorCode ? String(entry.errorCode).slice(0, 64) : null,
      errorMessage: entry.errorMessage ? String(entry.errorMessage).slice(0, 512) : null
    };

    this.prisma.difyUsageLog
      .create({ data: row })
      .catch((error) => {
        this.logger.warn(
          `failed to persist DifyUsageLog: ${error instanceof Error ? error.message : String(error)}`
        );
      });
  }
}

function normalizeNonNegative(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.round(parsed);
}
