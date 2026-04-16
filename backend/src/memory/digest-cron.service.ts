import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { ChatflowSummaryTrigger, ChatflowSummaryType, MessageRole } from "@prisma/client";
import { getAppConfig } from "../shared/app-config";
import { PrismaService } from "../shared/prisma.service";
import { MemoryExtractionService } from "./memory-extraction.service";
import { UserProfileService } from "./user-profile.service";
import { ZhipuClientService } from "./zhipu-client.service";
import {
  DAILY_DIGEST_SYSTEM_PROMPT,
  WEEKLY_DIGEST_SYSTEM_PROMPT,
  buildDigestUserPrompt
} from "./digest-cron.prompt";

/**
 * Phase 1.7 —— 定时跨对话汇总 Cron
 *
 * 每日 22:00：遍历当天有消息的用户，汇总所有对话 → 写 ChatflowSummary（trigger=cron_daily）
 * 每周一 10:00：遍历本周有消息的用户，汇总所有对话 → 写 ChatflowSummary（trigger=cron_weekly）
 *
 * 写入后级联触发：
 *   - MemoryExtractionService.extractAsync → 从汇总中补抽 L1 事实（UserFact）
 *   - UserProfileService.recomputeAsync   → 重算 L3 聚合画像（UserProfile）
 *
 * 不生成报告、不推送用户，纯后台数据库更新。
 */

@Injectable()
export class DigestCronService {
  private readonly logger = new Logger(DigestCronService.name);
  private readonly config = getAppConfig();

  constructor(
    private readonly prisma: PrismaService,
    private readonly zhipu: ZhipuClientService,
    private readonly memoryExtraction: MemoryExtractionService,
    private readonly userProfile: UserProfileService
  ) {}

  // ——————————————————————————————————————————
  // Cron 入口
  // ——————————————————————————————————————————

  /** 每天 22:00 触发日度汇总 */
  @Cron("0 22 * * *", { name: "digest-daily" })
  async handleDailyDigest(): Promise<void> {
    if (!this.config.digestCronEnabled) return;
    if (!this.zhipu.isConfigured()) return;

    const now = new Date();
    const since = new Date(now);
    since.setHours(0, 0, 0, 0); // 今天 00:00

    this.logger.log("digest-daily: started");
    await this.runDigestForPeriod("daily", since, now, ChatflowSummaryTrigger.cron_daily);
    this.logger.log("digest-daily: finished");
  }

  /** 每周一 10:00 触发周度汇总 */
  @Cron("0 10 * * 1", { name: "digest-weekly" })
  async handleWeeklyDigest(): Promise<void> {
    if (!this.config.digestCronEnabled) return;
    if (!this.zhipu.isConfigured()) return;

    const now = new Date();
    const since = new Date(now);
    since.setDate(since.getDate() - 7); // 7 天前
    since.setHours(0, 0, 0, 0);

    this.logger.log("digest-weekly: started");
    await this.runDigestForPeriod("weekly", since, now, ChatflowSummaryTrigger.cron_weekly);
    this.logger.log("digest-weekly: finished");
  }

  // ——————————————————————————————————————————
  // 核心逻辑
  // ——————————————————————————————————————————

  private async runDigestForPeriod(
    period: "daily" | "weekly",
    since: Date,
    until: Date,
    trigger: ChatflowSummaryTrigger
  ): Promise<void> {
    // 1. 找出时间段内有消息的用户
    const activeUsers = await this.prisma.message.groupBy({
      by: ["userId"],
      where: {
        createdAt: { gte: since, lt: until }
      }
    });

    this.logger.log(`digest-${period}: found ${activeUsers.length} active users`);

    const PER_USER_TIMEOUT_MS = 60_000;
    for (const { userId } of activeUsers) {
      try {
        await Promise.race([
          this.digestOneUser(userId, period, since, until, trigger),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("Digest timed out for user")), PER_USER_TIMEOUT_MS)
          )
        ]);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`digest-${period} failed userId=${userId}: ${msg}`);
      }
    }
  }

  private async digestOneUser(
    userId: string,
    period: "daily" | "weekly",
    since: Date,
    until: Date,
    trigger: ChatflowSummaryTrigger
  ): Promise<void> {
    const started = Date.now();

    // 去重：同一 userId + trigger 在同一天不重复跑
    const existingDigest = await this.prisma.chatflowSummary.findFirst({
      where: {
        userId,
        trigger,
        createdAt: { gte: since }
      },
      select: { id: true }
    });
    if (existingDigest) {
      this.logger.debug(`digest-${period}: skipped_dedup userId=${userId}`);
      return;
    }

    // 2. 拉该用户时间段内的所有消息
    const messages = await this.prisma.message.findMany({
      where: {
        userId,
        createdAt: { gte: since, lt: until }
      },
      orderBy: { createdAt: "asc" },
      select: {
        role: true,
        text: true,
        agentKey: true,
        createdAt: true
      },
      take: 200 // 上限防止超长
    });

    if (messages.length < this.config.digestCronMinMessages) {
      this.logger.debug(
        `digest-${period}: skipped_too_few userId=${userId} count=${messages.length}`
      );
      return;
    }

    // 3. 拉已有的单次实时摘要作为辅助上下文
    const existingSummaries = await this.prisma.chatflowSummary.findMany({
      where: {
        userId,
        trigger: { in: ["agent_switch", "session_completed", "manual"] },
        createdAt: { gte: since, lt: until }
      },
      orderBy: { createdAt: "asc" },
      select: { content: true, sourceAgentKey: true, createdAt: true }
    });

    const summariesText = existingSummaries.length
      ? existingSummaries
          .map((s) => `[${s.sourceAgentKey || "?"}] ${s.content}`)
          .join("\n")
      : "";

    // 4. 构建消息原文 transcript（截断避免超 token）
    const messagesText = this.buildTranscript(messages);

    // 5. 调 LLM 生成跨对话汇总
    const systemPrompt = period === "daily"
      ? DAILY_DIGEST_SYSTEM_PROMPT
      : WEEKLY_DIGEST_SYSTEM_PROMPT;

    const completion = await this.zhipu.chatCompletion({
      model: this.config.digestCronModel,
      timeoutMs: this.config.digestCronTimeoutMs,
      maxTokens: this.config.digestCronMaxTokens,
      temperature: 0.3,
      responseFormat: "text",
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: buildDigestUserPrompt({
            period,
            summaries: summariesText,
            messages: messagesText
          })
        }
      ]
    });

    const content = (completion.content || "").trim();
    if (!content) {
      this.logger.debug(`digest-${period}: empty_result userId=${userId}`);
      return;
    }

    // 6. 写入 ChatflowSummary
    await this.prisma.chatflowSummary.create({
      data: {
        userId,
        memoryType: ChatflowSummaryType.session_summary,
        trigger,
        content: content.slice(0, 3000),
        sourceAgentKey: `digest_${period}`,
        sourceRangeStart: since,
        sourceRangeEnd: until
      }
    });

    this.logger.log(
      `digest-${period}: ok userId=${userId} msgs=${messages.length} chars=${content.length} tokens=${completion.usage?.totalTokens || 0} ms=${Date.now() - started}`
    );

    // 7. 级联：从汇总中补抽事实 + 重算画像
    this.memoryExtraction.extractAsync(userId, {
      userText: messagesText.slice(0, 2000),
      assistantText: content,
      agentKey: `digest_${period}`
    });
    this.userProfile.recomputeAsync(userId);
  }

  private buildTranscript(
    messages: Array<{ role: MessageRole; text: string; agentKey: string | null; createdAt: Date }>
  ): string {
    const lines: string[] = [];
    let totalChars = 0;
    const MAX_CHARS = 8000; // 防止 prompt 过长

    for (const msg of messages) {
      const speaker = msg.role === MessageRole.USER ? "用户" : (msg.agentKey || "AI");
      const text = msg.text.length > 400 ? `${msg.text.slice(0, 400)}…` : msg.text;
      const line = `${speaker}：${text}`;
      totalChars += line.length;
      if (totalChars > MAX_CHARS) break;
      lines.push(line);
    }
    return lines.join("\n");
  }
}
