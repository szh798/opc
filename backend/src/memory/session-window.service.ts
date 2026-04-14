import { Injectable, Logger } from "@nestjs/common";
import { SessionContextEntry, SessionContextRole } from "@prisma/client";
import { getAppConfig } from "../shared/app-config";
import { PrismaService } from "../shared/prisma.service";

/**
 * Phase 1.4 —— 60 分钟滑动会话窗口（Layer A）
 * 对齐 abundant-forging-papert.md §3.2 呼吸节奏三 + §4.1 Layer A 注入
 *
 * 写入：每条用户消息 / assistant 响应追加一行，expiresAt = now + ttl
 * 读取：查 expiresAt > now() 的最近 N 条，按时间正序渲染成 "[5分钟前·挖宝] ..." 的中文块
 *
 * 所有写入都是 fire-and-forget（setImmediate 脱离主 Promise 链），
 * 任何错误只记日志，永不抛出，不阻塞 stream 返回链路。
 */

type AppendInput = {
  role: SessionContextRole;
  content: string;
  agentKey?: string | null;
  chatflowId?: string | null;
  sourceMessageId?: string | null;
};

const AGENT_LABELS: Record<string, string> = {
  master: "一树",
  asset: "挖宝",
  execution: "搞钱",
  mindset: "扎心",
  steward: "管家"
};

// 懒清理：每次 append 有 5% 概率顺手 DELETE 该用户的过期窗口行。
// 数据量 < 1k 时完全够用，省去额外的 cron / partition 基建。
const LAZY_GC_PROBABILITY = 0.05;

@Injectable()
export class SessionWindowService {
  private readonly logger = new Logger(SessionWindowService.name);
  private readonly config = getAppConfig();

  constructor(private readonly prisma: PrismaService) {}

  /**
   * fire-and-forget 追加一条会话窗口消息。
   */
  appendAsync(userId: string, input: AppendInput): void {
    if (!userId) return;
    const content = String(input.content || "").trim();
    if (!content) return;

    setImmediate(() => {
      this.append(userId, { ...input, content }).catch((err) => {
        this.logger.warn(
          `session-window append failed userId=${userId}: ${err?.message || err}`
        );
      });
    });
  }

  private async append(userId: string, input: AppendInput): Promise<void> {
    const ttlMs = this.config.sessionWindowTtlMinutes * 60 * 1000;
    const expiresAt = new Date(Date.now() + ttlMs);
    await this.prisma.sessionContextEntry.create({
      data: {
        userId,
        role: input.role,
        content: input.content.slice(0, 4000),
        agentKey: input.agentKey || null,
        chatflowId: input.chatflowId || null,
        sourceMessageId: input.sourceMessageId || null,
        expiresAt
      }
    });
    if (Math.random() < LAZY_GC_PROBABILITY) {
      await this.gcExpired(userId).catch((err) => {
        this.logger.debug(
          `session-window lazy GC failed userId=${userId}: ${err?.message || err}`
        );
      });
    }
  }

  private async gcExpired(userId: string): Promise<void> {
    const result = await this.prisma.sessionContextEntry.deleteMany({
      where: { userId, expiresAt: { lt: new Date() } }
    });
    if (result.count > 0) {
      this.logger.debug(
        `session-window gc userId=${userId} deleted=${result.count}`
      );
    }
  }

  /**
   * 查最近未过期的 N 条消息，按时间正序（旧 → 新）返回。
   * 不做任何格式化，让调用方决定 Layer A / agent_switch 摘要 / 其它用途。
   */
  async fetchRecent(
    userId: string,
    options?: { limit?: number; sinceAgentKey?: string }
  ): Promise<SessionContextEntry[]> {
    if (!userId) return [];
    const limit = options?.limit ?? this.config.sessionWindowMaxMessages;
    const where: Record<string, unknown> = {
      userId,
      expiresAt: { gt: new Date() }
    };
    if (options?.sinceAgentKey) {
      where.agentKey = options.sinceAgentKey;
    }
    const rows = await this.prisma.sessionContextEntry.findMany({
      where: where as never,
      orderBy: { createdAt: "desc" },
      take: limit
    });
    // DB 里是时间倒序，对外返回正序
    return rows.reverse();
  }

  /**
   * 把会话窗口渲染为 Layer A 中文文本块。空窗口返回空串，调用方据此判断是否拼接。
   *
   * 输出示例：
   *   最近对话：
   *   [3分钟前·挖宝] 用户：我做了5年产品经理
   *   [3分钟前·挖宝] 挖宝：产品经理的核心优势是...
   */
  formatAsLayerA(entries: SessionContextEntry[]): string {
    if (!entries.length) return "";
    const now = Date.now();
    const lines: string[] = ["最近对话："];
    for (const entry of entries) {
      const ago = this.formatTimeAgo(now - entry.createdAt.getTime());
      const speaker =
        entry.role === "user"
          ? "用户"
          : AGENT_LABELS[entry.agentKey || ""] || (entry.agentKey ? entry.agentKey : "助手");
      const text = entry.content.length > 200 ? `${entry.content.slice(0, 200)}…` : entry.content;
      lines.push(`[${ago}·${speaker}] ${text}`);
    }
    return lines.join("\n");
  }

  private formatTimeAgo(deltaMs: number): string {
    if (deltaMs < 60 * 1000) return "刚刚";
    const minutes = Math.floor(deltaMs / (60 * 1000));
    if (minutes < 60) return `${minutes}分钟前`;
    const hours = Math.floor(minutes / 60);
    return `${hours}小时前`;
  }
}
