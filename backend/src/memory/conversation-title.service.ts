import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../shared/prisma.service";
import { buildConversationLabelFromText } from "../shared/text-normalizer";
import { getAppConfig } from "../shared/app-config";
import { ZhipuClientService } from "./zhipu-client.service";

/**
 * 根据用户首轮对话 + 助手首轮回复，用 GLM 生成一个 ≤10 字的会话标题，
 * 覆盖侧边栏 RECENT CHATS 原先的 "{date} {用户原文前 12 字}" 默认 label。
 *
 * 触发时机：router.service 检测到某条 conversation 的 label 刚从 "路由会话-xxx"
 * 被 updateMany 成 "{date} {snippet}" —— 这说明本轮是该会话第一次收到用户文本，
 * 是生成标题的最佳时机（有足够语料，且后续轮不会重复触发）。
 *
 * 策略：
 *   - fire-and-forget，绝不阻塞 stream 返回
 *   - Zhipu 未配置 / 调用失败时静默保留原 snippet label
 *   - 只更新仍然匹配 "{date} " 前缀的 label，避免覆盖将来可能出现的用户手动改名
 */

const SYSTEM_PROMPT =
  "你是一个会话标题生成器。你的任务是根据一段用户和助手的首轮对话,生成一个中文简短标题,用于侧边栏 RECENT CHATS 展示。\n" +
  "要求:\n" +
  "1. 标题必须是中文,不超过 10 个字\n" +
  "2. 用名词短语概括核心话题,不要写成完整句子,不要带标点,不要带引号\n" +
  "3. 聚焦在用户真正关心的事情(工作/项目/问题),而不是助手的追问\n" +
  "4. 只输出标题本身,不要任何解释、前缀、后缀";

function buildUserPrompt(userText: string, assistantText: string) {
  return (
    "请为以下对话生成标题:\n\n" +
    `用户:${userText}\n\n` +
    `助手:${assistantText}\n\n` +
    "标题:"
  );
}

const TITLE_DATE_PREFIX_RE = /^\d+\/\d+\s/;

function cleanTitle(raw: string): string {
  let value = String(raw || "").trim();
  // 去掉模型有时候会加的引号、书名号、冒号前缀
  value = value.replace(/^[「『"'《\[(]+/, "").replace(/[」』"'》\])]+$/, "");
  value = value.replace(/^标题[:：]\s*/, "");
  // 去掉所有空白和末尾标点
  value = value.replace(/[\s。,，、！？!?.]+$/g, "").trim();
  return value;
}

@Injectable()
export class ConversationTitleService {
  private readonly logger = new Logger(ConversationTitleService.name);
  private readonly config = getAppConfig();

  constructor(
    private readonly prisma: PrismaService,
    private readonly zhipu: ZhipuClientService
  ) {}

  /**
   * fire-and-forget：给一条会话生成模型摘要标题并写入 conversation.label。
   * 调用方保证：本轮是 conversationId 的第一次用户文本。
   */
  generateAsync(params: {
    conversationId: string;
    userText: string;
    assistantText: string;
  }): void {
    if (!this.zhipu.isConfigured()) return;
    if (!params.conversationId || !params.userText || !params.assistantText) return;

    setImmediate(() => {
      this.runGenerate(params).catch((err) => {
        this.logger.warn(
          `conversation title failed conversationId=${params.conversationId}: ${
            err?.message || err
          }`
        );
      });
    });
  }

  private async runGenerate(params: {
    conversationId: string;
    userText: string;
    assistantText: string;
  }): Promise<void> {
    // 截断过长原文避免 token 浪费:标题只需要主旨,没必要把整段都喂进去
    const userSnippet = params.userText.slice(0, 400);
    const assistantSnippet = params.assistantText.slice(0, 400);

    const result = await this.zhipu.chatCompletion({
      model: this.config.chatflowSummarizerModel,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(userSnippet, assistantSnippet) }
      ],
      temperature: 0.3,
      maxTokens: 32,
      timeoutMs: 12000
    });

    const title = cleanTitle(result.content);
    if (!title) {
      this.logger.warn(
        `conversation title empty after clean conversationId=${params.conversationId} raw=${result.content}`
      );
      return;
    }

    // 复用现有 label 格式 "{M/D} {text}" —— 保持侧边栏视觉一致
    const nextLabel = buildConversationLabelFromText(title);

    // 只覆盖仍然是默认 "{M/D} " 前缀的 label,避免踩到未来可能的手动重命名
    const current = await this.prisma.conversation.findUnique({
      where: { id: params.conversationId },
      select: { label: true }
    });
    if (!current) return;
    if (!TITLE_DATE_PREFIX_RE.test(String(current.label || ""))) return;

    await this.prisma.conversation.update({
      where: { id: params.conversationId },
      data: { label: nextLabel }
    });

    this.logger.log(
      `conversation title generated conversationId=${params.conversationId} title="${title}"`
    );
  }
}
