import { Injectable, Logger } from "@nestjs/common";
import { ChatflowSummary, ChatflowSummaryTrigger, ChatflowSummaryType } from "@prisma/client";
import { getAppConfig } from "../shared/app-config";
import { PrismaService } from "../shared/prisma.service";
import {
  CHATFLOW_SUMMARY_SYSTEM_PROMPT,
  buildChatflowSummaryUserPrompt
} from "./chatflow-summary.prompt";
import { SessionWindowService } from "./session-window.service";
import { UserProfileService } from "./user-profile.service";
import { ZhipuClientService } from "./zhipu-client.service";

/**
 * Phase 1.5 —— 会话摘要器（Layer C 写入源 + 触发 L3 画像重算）
 * 对齐 abundant-forging-papert.md §3.2 呼吸节奏二 + §4.3
 *
 * 触发时机（由 router.service 调用）：
 *   - agent_switch：上一个 agent 的会话事实上结束，应该写摘要
 *   - session_completed：ConversationState 转为 completed
 *   - manual：未来预留给"用户显式记笔记"
 *
 * 写入后会级联触发 UserProfileService.recomputeAsync 做 L3 聚合。
 *
 * 去重：同一 userId + sourceAgentKey 在 chatflowSummaryDedupWindowMs 窗口内已有摘要时跳过，
 * 避免用户短时间反复 agent_switch 时刷出一堆相似摘要。
 */

type TriggerInput = {
  agentKey?: string | null;
  chatflowId?: string | null;
  trigger: ChatflowSummaryTrigger;
};

@Injectable()
export class ChatflowSummaryService {
  private readonly logger = new Logger(ChatflowSummaryService.name);
  private readonly config = getAppConfig();

  constructor(
    private readonly prisma: PrismaService,
    private readonly zhipu: ZhipuClientService,
    private readonly sessionWindow: SessionWindowService,
    private readonly userProfile: UserProfileService
  ) {}

  /**
   * fire-and-forget 触发摘要写入。
   * 从 session_window 读 sourceAgentKey 的最近若干条消息做原料。
   */
  summarizeAsync(userId: string, input: TriggerInput): void {
    if (!this.config.chatflowSummaryEnabled) return;
    if (!this.zhipu.isConfigured()) return;
    if (!userId) return;

    setImmediate(() => {
      this.runSummarize(userId, input).catch((err) => {
        this.logger.warn(
          `chatflow summary failed userId=${userId} agent=${input.agentKey || "?"}: ${err?.message || err}`
        );
      });
    });
  }

  /**
   * 读 Layer C：最近 N 条摘要，按时间正序返回。
   */
  async fetchLayerCSummaries(userId: string, limit?: number): Promise<ChatflowSummary[]> {
    if (!userId) return [];
    const take = limit ?? this.config.chatflowSummaryInjectLimit;
    const rows = await this.prisma.chatflowSummary.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take
    });
    return rows.reverse();
  }

  /**
   * 渲染为 Layer C 中文文本块。
   *
   * 输出示例：
   *   之前对话摘要：
   *   [挖宝·3小时前] 用户在资产盘点中暴露出 5 年产品经理经历...
   *   [搞钱·昨天] 用户在生意体检中说自己月收入 3 万...
   */
  formatAsLayerC(summaries: ChatflowSummary[]): string {
    if (!summaries.length) return "";
    const lines: string[] = ["之前对话摘要："];
    const now = Date.now();
    for (const s of summaries) {
      const ago = this.formatTimeAgoShort(now - s.createdAt.getTime());
      const agent = s.sourceAgentKey || "?";
      const content = s.content.length > 300 ? `${s.content.slice(0, 300)}…` : s.content;
      lines.push(`[${agent}·${ago}] ${content}`);
    }
    return lines.join("\n");
  }

  // ——————————————————————————————————————————
  // Internal
  // ——————————————————————————————————————————

  private async runSummarize(userId: string, input: TriggerInput): Promise<void> {
    const started = Date.now();

    // 去重：同 user + agent 在 dedup 窗口内已有摘要 → 直接跳过。
    // 短时间多次 agent_switch 不应该刷出一堆几乎一样的摘要。
    const dedupSince = new Date(Date.now() - this.config.chatflowSummaryDedupWindowMs);
    const recent = await this.prisma.chatflowSummary.findFirst({
      where: {
        userId,
        sourceAgentKey: input.agentKey || null,
        createdAt: { gt: dedupSince }
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, createdAt: true }
    });
    if (recent) {
      this.logger.debug(
        `summary=skipped_dedup userId=${userId} agent=${input.agentKey || "?"} lastAt=${recent.createdAt.toISOString()}`
      );
      return;
    }

    const entries = await this.sessionWindow.fetchRecent(userId, {
      limit: 40,
      sinceAgentKey: input.agentKey || undefined
    });

    if (entries.length < this.config.chatflowSummaryMinMessages) {
      this.logger.debug(
        `summary=skipped_too_short userId=${userId} agent=${input.agentKey || "?"} count=${entries.length}`
      );
      return;
    }

    const transcript = this.buildTranscript(entries);
    const completion = await this.zhipu.chatCompletion({
      model: this.config.chatflowSummarizerModel,
      timeoutMs: this.config.chatflowSummarizerTimeoutMs,
      maxTokens: this.config.chatflowSummarizerMaxTokens,
      temperature: 0.3,
      responseFormat: "text",
      messages: [
        { role: "system", content: CHATFLOW_SUMMARY_SYSTEM_PROMPT },
        {
          role: "user",
          content: buildChatflowSummaryUserPrompt({
            agentKey: input.agentKey,
            chatflowId: input.chatflowId,
            transcript
          })
        }
      ]
    });

    const content = (completion.content || "").trim();
    if (!content) {
      this.logger.debug(`summary=empty userId=${userId} agent=${input.agentKey || "?"}`);
      return;
    }

    const rangeStart = entries[0]?.createdAt || null;
    const rangeEnd = entries[entries.length - 1]?.createdAt || null;

    await this.prisma.chatflowSummary.create({
      data: {
        userId,
        memoryType: ChatflowSummaryType.session_summary,
        trigger: input.trigger,
        content: content.slice(0, 2000),
        sourceAgentKey: input.agentKey || null,
        sourceChatflowId: input.chatflowId || null,
        sourceRangeStart: rangeStart,
        sourceRangeEnd: rangeEnd
      }
    });

    this.logger.log(
      `summary=ok userId=${userId} agent=${input.agentKey || "?"} trigger=${input.trigger} chars=${content.length} tokens=${completion.usage?.totalTokens || 0} ms=${Date.now() - started}`
    );

    // 摘要写入成功 → 级联触发 L3 画像重算
    this.userProfile.recomputeAsync(userId);
  }

  private buildTranscript(entries: Array<{ role: string; content: string; agentKey: string | null }>): string {
    return entries
      .map((e) => {
        const speaker = e.role === "user" ? "用户" : e.agentKey || "AI";
        const text = e.content.length > 400 ? `${e.content.slice(0, 400)}…` : e.content;
        return `${speaker}：${text}`;
      })
      .join("\n");
  }

  private formatTimeAgoShort(deltaMs: number): string {
    const minutes = Math.floor(deltaMs / (60 * 1000));
    if (minutes < 1) return "刚刚";
    if (minutes < 60) return `${minutes}分钟前`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}小时前`;
    const days = Math.floor(hours / 24);
    return `${days}天前`;
  }
}
