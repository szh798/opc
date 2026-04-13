import { Injectable, Logger } from "@nestjs/common";
import {
  Prisma,
  UserFactCategory,
  UserFactDimension,
  UserFactSource
} from "@prisma/client";
import { getAppConfig } from "../shared/app-config";
import { PrismaService } from "../shared/prisma.service";
import {
  MEMORY_EXTRACTION_SYSTEM_PROMPT,
  buildExtractionUserPrompt
} from "./memory-extraction.prompt";
import { ZhipuClientService } from "./zhipu-client.service";

/**
 * L1 事实抽取器。对齐 abundant-forging-papert.md §3.2 呼吸节奏一 + §4.2 抽取器 prompt。
 *
 * 使用方式（fire-and-forget，不阻塞主对话链路）：
 *   this.memoryExtractionService.extractAsync(userId, { userText, assistantText, ... });
 *
 * 同一 (userId, category, factKey) 的新事实值：
 *   - 与当前 active 版本相同 → 幂等跳过
 *   - 不同 → 旧版 isActive=false，新版 version+1 写入
 */

type ExtractAsyncInput = {
  userText: string;
  assistantText: string;
  agentKey?: string;
  chatflowId?: string;
  userMessageId?: string;
};

type RawExtractedFact = {
  category?: unknown;
  dimension?: unknown;
  key?: unknown;
  value?: unknown;
  confidence?: unknown;
};

type NormalizedFact = {
  category: UserFactCategory;
  dimension: UserFactDimension | null;
  factKey: string;
  factValue: string;
  confidence: number;
};

const MAX_FACTS_PER_TURN = 8;
const MIN_CONFIDENCE = 0.5;
const MAX_FACT_KEY_LEN = 128;
const MAX_FACT_VALUE_LEN = 1000;

const VALID_CATEGORIES = new Set<string>([
  "skill",
  "resource",
  "cognition",
  "relationship",
  "experience",
  "personality",
  "preference",
  "pain_point",
  "goal",
  "business",
  "behavior"
]);

const VALID_DIMENSIONS = new Set<string>([
  "capability",
  "resource",
  "cognition",
  "relationship"
]);

@Injectable()
export class MemoryExtractionService {
  private readonly logger = new Logger(MemoryExtractionService.name);
  private readonly config = getAppConfig();

  constructor(
    private readonly prisma: PrismaService,
    private readonly zhipu: ZhipuClientService
  ) {}

  /**
   * fire-and-forget 入口。永远不 throw，错误仅记日志。
   */
  extractAsync(userId: string, input: ExtractAsyncInput): void {
    if (!this.config.memoryExtractionEnabled) return;
    if (!this.zhipu.isConfigured()) {
      // 未配置 key 时静默跳过，不刷日志
      return;
    }
    if (!userId) return;
    // 空对话跳过
    if (!(input.userText || "").trim() && !(input.assistantText || "").trim()) {
      return;
    }

    // 脱离主 Promise 链，用 setImmediate 避免阻塞 stream 返回
    setImmediate(() => {
      this.runExtraction(userId, input).catch((err) => {
        this.logger.warn(
          `memory extraction failed userId=${userId}: ${err?.message || err}`
        );
      });
    });
  }

  private async runExtraction(userId: string, input: ExtractAsyncInput): Promise<void> {
    const started = Date.now();
    const completion = await this.zhipu.chatCompletion({
      model: this.config.memoryExtractorModel,
      timeoutMs: this.config.memoryExtractorTimeoutMs,
      maxTokens: this.config.memoryExtractorMaxTokens,
      temperature: 0.1,
      responseFormat: "json_object",
      messages: [
        { role: "system", content: MEMORY_EXTRACTION_SYSTEM_PROMPT },
        {
          role: "user",
          content: buildExtractionUserPrompt({
            userText: input.userText,
            assistantText: input.assistantText,
            agentKey: input.agentKey,
            chatflowId: input.chatflowId
          })
        }
      ]
    });

    const facts = this.parseAndNormalize(completion.content);
    if (facts.length === 0) {
      this.logger.debug(
        `extraction=empty userId=${userId} tokens=${completion.usage?.totalTokens || 0} ms=${Date.now() - started}`
      );
      return;
    }

    const writeResult = await this.persistFacts(userId, facts, input);
    this.logger.log(
      `extraction=ok userId=${userId} parsed=${facts.length} inserted=${writeResult.inserted} bumped=${writeResult.bumped} skipped=${writeResult.skipped} tokens=${completion.usage?.totalTokens || 0} ms=${Date.now() - started}`
    );
  }

  // ——————————————————————————————————————————
  // 解析 + 规范化
  // ——————————————————————————————————————————

  private parseAndNormalize(rawContent: string): NormalizedFact[] {
    const content = this.stripCodeFence(rawContent || "");
    if (!content) return [];

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      this.logger.debug(`extraction=parse_error content=${content.slice(0, 200)}`);
      return [];
    }

    // 期望形如 { "facts": [...] }；宽容处理直接返回数组的情况
    let rawArray: unknown;
    if (Array.isArray(parsed)) {
      rawArray = parsed;
    } else if (parsed && typeof parsed === "object") {
      rawArray = (parsed as Record<string, unknown>).facts;
    }
    if (!Array.isArray(rawArray)) return [];

    const normalized: NormalizedFact[] = [];
    for (const raw of rawArray) {
      if (!raw || typeof raw !== "object") continue;
      const n = this.normalizeOne(raw as RawExtractedFact);
      if (n) normalized.push(n);
      if (normalized.length >= MAX_FACTS_PER_TURN) break;
    }
    return normalized;
  }

  private stripCodeFence(text: string): string {
    const trimmed = text.trim();
    if (!trimmed.startsWith("```")) return trimmed;
    // 去掉 ```json ... ``` 包裹
    return trimmed
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
  }

  private normalizeOne(raw: RawExtractedFact): NormalizedFact | null {
    const category = String(raw.category || "").trim().toLowerCase();
    if (!VALID_CATEGORIES.has(category)) return null;

    const factKey = String(raw.key || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "");
    if (!factKey) return null;

    const factValue = String(raw.value || "").trim();
    if (!factValue) return null;

    const confidenceRaw = Number(raw.confidence);
    const confidence = Number.isFinite(confidenceRaw) ? confidenceRaw : 1;
    if (confidence < MIN_CONFIDENCE) return null;

    let dimension: UserFactDimension | null = null;
    if (raw.dimension && raw.dimension !== "null") {
      const dimStr = String(raw.dimension).trim().toLowerCase();
      if (VALID_DIMENSIONS.has(dimStr)) {
        dimension = dimStr as UserFactDimension;
      }
    }

    return {
      category: category as UserFactCategory,
      dimension,
      factKey: factKey.slice(0, MAX_FACT_KEY_LEN),
      factValue: factValue.slice(0, MAX_FACT_VALUE_LEN),
      confidence: Math.max(0, Math.min(1, confidence))
    };
  }

  // ——————————————————————————————————————————
  // 写入 + 版本管理
  // ——————————————————————————————————————————

  private async persistFacts(
    userId: string,
    facts: NormalizedFact[],
    input: ExtractAsyncInput
  ): Promise<{ inserted: number; bumped: number; skipped: number }> {
    let inserted = 0;
    let bumped = 0;
    let skipped = 0;

    for (const fact of facts) {
      try {
        const result = await this.upsertOne(userId, fact, input);
        if (result === "inserted") inserted += 1;
        else if (result === "bumped") bumped += 1;
        else skipped += 1;
      } catch (err) {
        // 单条失败不影响其它
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `upsert fact failed userId=${userId} key=${fact.factKey}: ${msg}`
        );
      }
    }

    return { inserted, bumped, skipped };
  }

  private async upsertOne(
    userId: string,
    fact: NormalizedFact,
    input: ExtractAsyncInput
  ): Promise<"inserted" | "bumped" | "skipped"> {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.userFact.findFirst({
        where: {
          userId,
          category: fact.category,
          factKey: fact.factKey,
          isActive: true
        },
        orderBy: { version: "desc" }
      });

      if (!current) {
        await tx.userFact.create({
          data: {
            userId,
            category: fact.category,
            dimension: fact.dimension,
            factKey: fact.factKey,
            factValue: fact.factValue,
            confidence: fact.confidence,
            sourceMessageId: input.userMessageId || null,
            sourceChatflowId: input.chatflowId || null,
            extractedBy: UserFactSource.llm_realtime,
            isActive: true,
            version: 1
          }
        });
        return "inserted";
      }

      // 值未变且 dimension 一致 → 幂等跳过
      if (current.factValue === fact.factValue && current.dimension === fact.dimension) {
        return "skipped";
      }

      await tx.userFact.update({
        where: { id: current.id },
        data: { isActive: false }
      });
      await tx.userFact.create({
        data: {
          userId,
          category: fact.category,
          dimension: fact.dimension,
          factKey: fact.factKey,
          factValue: fact.factValue,
          confidence: fact.confidence,
          sourceMessageId: input.userMessageId || null,
          sourceChatflowId: input.chatflowId || null,
          extractedBy: UserFactSource.llm_realtime,
          isActive: true,
          version: current.version + 1
        }
      });
      return "bumped";
    }, {
      // 单条 upsert 不该占长事务
      timeout: 5000,
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted
    });
  }
}
