import { Injectable, Logger } from "@nestjs/common";
import { getAppConfig } from "./shared/app-config";
import { ZhipuClientService } from "./memory/zhipu-client.service";

type GenerationMode = "none" | "rules" | "llm" | "template";

export type ProfileNarrativeEvidence = {
  key: string;
  text: string;
  source: string;
};

export type ProfileNarrativeInput = {
  strengthsVisible: boolean;
  traitsVisible: boolean;
  ikigaiVisible: boolean;
  hasAssetReport: boolean;
  strengthsEvidence: ProfileNarrativeEvidence[];
  traitEvidence: ProfileNarrativeEvidence[];
  ikigaiEvidence: {
    strengths: string[];
    love: string[];
    worldNeeds: string[];
    willingToPay: string[];
    projectName: string;
    artifactTitle: string;
    feedbackSummary: string;
  };
  ruleStrengths: string[];
  templateIkigai: string;
};

export type ProfileNarrativeResult = {
  strengths: Array<{ label: string }>;
  traits: Array<{ label: string; tone: string }>;
  ikigai: string;
  generation: {
    strengths: Exclude<GenerationMode, "template">;
    traits: Exclude<GenerationMode, "rules" | "template">;
    ikigai: Exclude<GenerationMode, "rules">;
  };
};

type ParsedNarrativeOutput = {
  strengths?: Array<{ label?: unknown; evidenceKeys?: unknown }>;
  traits?: Array<{ label?: unknown; evidenceKeys?: unknown }>;
  ikigai?: unknown;
};

const TRAIT_TONE_BY_LABEL: Record<string, string> = {
  "稳步积累": "mint",
  "主动探索": "mint",
  "耐心推进": "gold",
  "执行落地": "gold",
  "感受敏锐": "sky",
  "持续复盘": "sky",
  "结构整理": "blue",
  "关系维护": "blue"
};

const ALLOWED_TRAITS = Object.keys(TRAIT_TONE_BY_LABEL);

@Injectable()
export class ProfileNarrativeService {
  private readonly logger = new Logger(ProfileNarrativeService.name);
  private readonly config = getAppConfig();

  constructor(private readonly zhipu: ZhipuClientService) {}

  async enrich(input: ProfileNarrativeInput): Promise<ProfileNarrativeResult> {
    const fallbackStrengths = input.strengthsVisible
      ? input.ruleStrengths.slice(0, 4).map((label) => ({ label }))
      : [];
    const fallbackIkigai = input.ikigaiVisible && input.templateIkigai ? input.templateIkigai : "";

    const result: ProfileNarrativeResult = {
      strengths: fallbackStrengths,
      traits: [],
      ikigai: fallbackIkigai,
      generation: {
        strengths: fallbackStrengths.length ? "rules" : "none",
        traits: "none",
        ikigai: fallbackIkigai ? "template" : "none"
      }
    };

    if (!this.shouldUseLlm(input)) {
      return result;
    }

    try {
      const completion = await this.zhipu.chatCompletion({
        model: this.config.profileLlmModel,
        timeoutMs: this.config.profileLlmTimeoutMs,
        maxTokens: this.config.profileLlmMaxTokens,
        temperature: 0.1,
        responseFormat: "json_object",
        messages: [
          {
            role: "system",
            content:
              "你是一树 OPC 的画像文案整理器。你只能根据给定证据生成结构化 JSON，不能脑补。输出 JSON 对象，键固定为 strengths、traits、ikigai。" +
              "strengths 输出 2-4 个差异化优势标签；traits 只能从给定白名单中选 0-3 个；ikigai 是 60-90 字中文短文。" +
              "如果证据不足，对应字段返回空数组或空字符串。不要使用“你天生”“你一定”等强断言。"
          },
          {
            role: "user",
            content: JSON.stringify({
              instructions: {
                allowedTraits: ALLOWED_TRAITS,
                strengthsVisible: input.strengthsVisible,
                traitsVisible: input.traitsVisible,
                ikigaiVisible: input.ikigaiVisible
              },
              strengthsEvidence: input.strengthsEvidence,
              traitEvidence: input.traitEvidence,
              ikigaiEvidence: input.ikigaiEvidence,
              outputSchema: {
                strengths: [{ label: "标签", evidenceKeys: ["证据 key"] }],
                traits: [{ label: "白名单标签", evidenceKeys: ["证据 key"] }],
                ikigai: "60-90 字短文"
              }
            })
          }
        ]
      });

      const parsed = this.parseOutput(completion.content);
      const llmStrengths = input.strengthsVisible ? this.normalizeStrengths(parsed) : [];
      const llmTraits = input.traitsVisible ? this.normalizeTraits(parsed) : [];
      const llmIkigai = input.ikigaiVisible ? this.normalizeIkigai(parsed.ikigai) : "";

      if (llmStrengths.length) {
        result.strengths = llmStrengths;
        result.generation.strengths = "llm";
      }

      if (llmTraits.length) {
        result.traits = llmTraits;
        result.generation.traits = "llm";
      }

      if (llmIkigai) {
        result.ikigai = llmIkigai;
        result.generation.ikigai = "llm";
      }

      return result;
    } catch (error) {
      this.logger.warn(`profile narrative llm failed: ${resolveErrorMessage(error)}`);
      return result;
    }
  }

  private shouldUseLlm(input: ProfileNarrativeInput) {
    if (!this.config.profileLlmEnrichEnabled) {
      return false;
    }
    if (!this.zhipu.isConfigured()) {
      return false;
    }

    return (
      (input.strengthsVisible && input.strengthsEvidence.length >= 2) ||
      (input.traitsVisible && input.traitEvidence.length >= 2) ||
      (input.ikigaiVisible && hasIkigaiSignals(input.ikigaiEvidence))
    );
  }

  private parseOutput(content: string): ParsedNarrativeOutput {
    const stripped = stripCodeFence(content);
    if (!stripped) {
      return {};
    }

    try {
      const parsed = JSON.parse(stripped);
      return parsed && typeof parsed === "object" ? (parsed as ParsedNarrativeOutput) : {};
    } catch {
      return {};
    }
  }

  private normalizeStrengths(parsed: ParsedNarrativeOutput) {
    if (!Array.isArray(parsed.strengths)) {
      return [];
    }

    const labels = dedupeStrings(
      parsed.strengths.map((item) => (item && typeof item === "object" ? String(item.label || "") : ""))
    ).slice(0, 4);

    return labels.map((label) => ({ label }));
  }

  private normalizeTraits(parsed: ParsedNarrativeOutput) {
    if (!Array.isArray(parsed.traits)) {
      return [];
    }

    const labels = dedupeStrings(
      parsed.traits.map((item) => (item && typeof item === "object" ? String(item.label || "") : ""))
    )
      .filter((label) => Object.prototype.hasOwnProperty.call(TRAIT_TONE_BY_LABEL, label))
      .slice(0, 3);

    return labels.map((label) => ({
      label,
      tone: TRAIT_TONE_BY_LABEL[label]
    }));
  }

  private normalizeIkigai(value: unknown) {
    const safe = String(value || "").trim().replace(/\s+/g, " ");
    if (!safe) {
      return "";
    }
    return safe.slice(0, 120);
  }
}

function stripCodeFence(text: string) {
  const trimmed = String(text || "").trim();
  if (!trimmed.startsWith("```")) {
    return trimmed;
  }

  return trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

function dedupeStrings(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const safe = String(value || "").trim();
    if (!safe || seen.has(safe)) {
      continue;
    }
    seen.add(safe);
    result.push(safe);
  }
  return result;
}

function hasIkigaiSignals(input: ProfileNarrativeInput["ikigaiEvidence"]) {
  const categories = [
    input.strengths.length ? "strengths" : "",
    input.love.length ? "love" : "",
    input.worldNeeds.length ? "worldNeeds" : "",
    input.willingToPay.length ? "willingToPay" : "",
    input.projectName ? "projectName" : "",
    input.artifactTitle ? "artifactTitle" : "",
    input.feedbackSummary ? "feedbackSummary" : ""
  ].filter(Boolean);

  const hasDirectionalSignal = !!(input.projectName || input.artifactTitle || input.willingToPay.length || input.worldNeeds.length);
  return categories.length >= 3 && hasDirectionalSignal;
}

function resolveErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error || "unknown_error");
}
