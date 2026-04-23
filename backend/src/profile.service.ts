import { Injectable } from "@nestjs/common";
import { Prisma, SnapshotKind, UserFactCategory, UserFactDimension, UserProfileType } from "@prisma/client";
import { UserProfileService } from "./memory/user-profile.service";
import { ProfileNarrativeService } from "./profile-narrative.service";
import { PrismaService } from "./shared/prisma.service";
import { DEFAULT_ASSET_INVENTORY_DATA, DEFAULT_PROFILE_DATA } from "./shared/templates";
import { readJsonObject } from "./shared/json";
import { UserService } from "./user.service";
import { buildAssetInventorySnapshot, collectUserInsights, UserInsights } from "./shared/user-insights";

type ProfilePhase = "empty" | "collecting" | "ready";

type ProfileViewMeta = {
  phase: ProfilePhase;
  visibility: {
    radar: boolean;
    strengths: boolean;
    traits: boolean;
    ikigai: boolean;
  };
  evidence: {
    userFactCount: number;
    factDimensions: string[];
    hasAssetFlowSnapshot: boolean;
    hasAssetReport: boolean;
  };
  generation: {
    strengths: "none" | "rules" | "llm";
    traits: "none" | "llm";
    ikigai: "none" | "template" | "llm";
  };
  hint: string;
};

type ActiveUserFact = {
  category: UserFactCategory;
  dimension: UserFactDimension | null;
  factKey: string;
  factValue: string;
  confidence: number;
  updatedAt: Date;
};

type AssetRadarDimension = {
  label: string;
  value: number;
  factCount?: number;
};

type AssetReportView = {
  hasReport: boolean;
  finalReport: string;
  reportBrief: string;
  reportVersion: string;
  generatedAt: string;
  isReview: boolean;
  sections: Array<{ title: string; lines: string[] }>;
};

@Injectable()
export class ProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly userService: UserService,
    private readonly userProfileService: UserProfileService,
    private readonly profileNarrativeService: ProfileNarrativeService
  ) {}

  async getProfile(userId?: string | null) {
    const user = await this.userService.requireUser(userId);
    const profileSnapshot = await this.ensureSnapshot(user.id, SnapshotKind.PROFILE, DEFAULT_PROFILE_DATA);
    const fallbackProfile = readJsonObject(profileSnapshot.data, DEFAULT_PROFILE_DATA);
    const insights = await collectUserInsights(this.prisma, user.id);
    const assetFlowContext = await this.getAssetInventoryFlowContext(user.id);
    const activeFacts = await this.readActiveUserFacts(user.id);
    const currentRadarProfile = await this.userProfileService.getCurrentProfile(user.id, UserProfileType.asset_radar);
    const assetReport = this.buildAssetReportFromFlowContext(assetFlowContext.flowState);
    const profileMeta = this.buildProfileMeta({
      activeFacts,
      currentRadarProfile,
      assetFlowContext,
      assetReport,
      insights
    });
    const radar = this.resolveProfileRadar(currentRadarProfile, assetFlowContext.data, profileMeta);
    const narrative = await this.buildProfileNarrative({
      profileMeta,
      activeFacts,
      assetInventoryData: assetFlowContext.data,
      assetReport,
      insights
    });
    const profile = {
      ...fallbackProfile,
      byline: insights.byline,
      radar,
      strengths: narrative.strengths,
      traits: narrative.traits,
      ikigai: narrative.ikigai,
      stageLabel: buildStageLabel(String(user.stage || ""), Number(user.streakDays), String(insights.stageLabel || "")),
      growthSummary: `最近 30 天你完成了 ${insights.monthly.completedTasks} 项任务、生成 ${insights.monthly.artifacts} 张成果卡，目前处在「${insights.stageLabel || "成长中"}」。`,
      profileMeta: {
        ...profileMeta,
        generation: narrative.generation
      }
    };
    await this.persistProfileArtifacts(user.id, insights, profile);
    const nextName = String(user.nickname || user.name || fallbackProfile.name || "访客").trim() || "访客";

    return {
      ...profile,
      name: nextName,
      initial: String(user.initial || nextName.slice(0, 1) || fallbackProfile.initial || "访").trim() || "访",
      avatarUrl: String(user.avatarUrl || fallbackProfile.avatarUrl || "").trim(),
      stageLabel: buildStageLabel(String(user.stage || ""), Number(user.streakDays), String(profile.stageLabel || "")),
      assetReport
    };
  }

  // 资产盘点报告视图数据——供 /profile 返回、供个人档案页「资产盘点报告」卡片使用
  private buildAssetReportFromFlowContext(flowState: Record<string, unknown>): AssetReportView {
    const asStr = (value: unknown) => String(value || "").trim();
    const finalReport = asStr(flowState.finalReport);
    const reportBrief = asStr(flowState.reportBrief);
    const reportVersion = asStr(flowState.reportVersion);
    const generatedAt = asStr(flowState.lastReportGeneratedAt);
    const isReview = String(flowState.isReview || "").toLowerCase() === "true";

    const sectionMap = parseTitledSections(finalReport);
    const sections: Array<{ title: string; lines: string[] }> = Object.keys(sectionMap).map((title) => ({
      title,
      lines: Array.isArray(sectionMap[title]) ? sectionMap[title] : []
    }));

    return {
      hasReport: !!finalReport,
      finalReport,
      reportBrief,
      reportVersion,
      generatedAt,
      isReview,
      sections
    };
  }

  async getAssetInventory(userId?: string | null) {
    const user = await this.userService.requireUser(userId);
    const insights = await collectUserInsights(this.prisma, user.id);
    const { assetInventory } = await this.persistProfileArtifacts(user.id, insights);
    const nextName = String(user.nickname || user.name || assetInventory.profileName || "访客").trim() || "访客";

    return {
      ...assetInventory,
      profileName: nextName
    };
  }

  async getAssetInventoryFlowContext(userId: string) {
    const snapshot = await this.ensureSnapshot(userId, SnapshotKind.ASSET_INVENTORY, DEFAULT_ASSET_INVENTORY_DATA);
    const data = readJsonObject(snapshot.data, DEFAULT_ASSET_INVENTORY_DATA);
    const flowState = readJsonObject(
      data.flowState,
      DEFAULT_ASSET_INVENTORY_DATA.flowState as Record<string, unknown>
    );

    return {
      data,
      flowState,
      createdAt: snapshot.createdAt.toISOString(),
      updatedAt: snapshot.updatedAt.toISOString()
    };
  }

  private async readActiveUserFacts(userId: string): Promise<ActiveUserFact[]> {
    const facts = await this.prisma.userFact.findMany({
      where: {
        userId,
        isActive: true
      },
      orderBy: {
        updatedAt: "desc"
      },
      select: {
        category: true,
        dimension: true,
        factKey: true,
        factValue: true,
        confidence: true,
        updatedAt: true
      }
    });

    return facts.map((fact) => ({
      category: fact.category,
      dimension: fact.dimension,
      factKey: fact.factKey,
      factValue: String(fact.factValue || "").trim(),
      confidence: Number(fact.confidence) || 0,
      updatedAt: fact.updatedAt
    }));
  }

  private buildProfileMeta(input: {
    activeFacts: ActiveUserFact[];
    currentRadarProfile: { profileData: Prisma.JsonValue; sourceFactCount: number } | null;
    assetFlowContext: { data: Record<string, unknown>; flowState: Record<string, unknown> };
    assetReport: AssetReportView;
    insights: UserInsights;
  }): ProfileViewMeta {
    const factDimensions = compactUnique(
      input.activeFacts
        .map((fact) => String(fact.dimension || "").trim())
        .filter(Boolean)
    );
    const hasAssetFlowSnapshot = !!(
      normalizeText(input.assetFlowContext.flowState.profileSnapshot) ||
      normalizeText(input.assetFlowContext.flowState.dimensionReports)
    );
    const readyStages = new Set(["correction_loop", "ready_for_report", "report_generated"]);
    const inventoryStage = normalizeText(input.assetFlowContext.flowState.inventoryStage);
    const profileSections = readFlowSectionMap(input.assetFlowContext.data, "profileSnapshot");
    const sectionCount = countNonEmptyProfileSections(profileSections);
    const radarDimensions = readRadarDimensions(input.currentRadarProfile);
    const radarReady = !!(
      input.currentRadarProfile &&
      input.currentRadarProfile.sourceFactCount >= 4 &&
      radarDimensions.filter((item) => Number(item.factCount || 0) > 0).length >= 2
    );

    let phase: ProfilePhase = "collecting";
    if (input.activeFacts.length < 2 && !hasAssetFlowSnapshot && !input.assetReport.hasReport) {
      phase = "empty";
    } else if (radarReady || readyStages.has(inventoryStage) || sectionCount >= 2) {
      phase = "ready";
    }

    const traitFacts = collectTraitFacts(input.activeFacts);
    const ikigaiSignals = collectIkigaiSignals(input.assetFlowContext.data);
    const ikigaiVisible = buildIkigaiVisibility(ikigaiSignals, input.insights);
    const hint = phase === "ready"
      ? "你的档案已生成，会随着新的对话和动作持续更新。"
      : phase === "collecting"
        ? "已捕捉到少量线索，继续补 2-3 轮会生成画像。"
        : "先聊几轮，档案还没开始积累。";

    return {
      phase,
      visibility: {
        radar: phase === "ready",
        strengths: phase === "ready",
        traits: phase === "ready" && input.activeFacts.length >= 4 && traitFacts.length >= 2,
        ikigai: phase === "ready" && ikigaiVisible
      },
      evidence: {
        userFactCount: input.activeFacts.length,
        factDimensions,
        hasAssetFlowSnapshot,
        hasAssetReport: input.assetReport.hasReport
      },
      generation: {
        strengths: "none",
        traits: "none",
        ikigai: "none"
      },
      hint
    };
  }

  private resolveProfileRadar(
    currentRadarProfile: { profileData: Prisma.JsonValue; sourceFactCount: number } | null,
    assetInventoryData: Record<string, unknown>,
    profileMeta: ProfileViewMeta
  ) {
    const defaults = buildEmptyRadar();
    if (!profileMeta.visibility.radar) {
      return defaults;
    }

    const currentDimensions = readRadarDimensions(currentRadarProfile);
    if (currentDimensions.length) {
      return defaults.map((item) => {
        const hit = currentDimensions.find((dimension) => dimension.label === item.label);
        return hit ? { ...item, value: clampPercent(hit.value) } : item;
      });
    }

    const assetDimensions = readAssetDimensionScores(assetInventoryData);
    if (assetDimensions.length) {
      return defaults.map((item) => {
        const hit = assetDimensions.find((dimension) => dimension.label === item.label);
        return hit ? { ...item, value: clampPercent(hit.value) } : item;
      });
    }

    return defaults;
  }

  private async buildProfileNarrative(input: {
    profileMeta: ProfileViewMeta;
    activeFacts: ActiveUserFact[];
    assetInventoryData: Record<string, unknown>;
    assetReport: AssetReportView;
    insights: UserInsights;
  }) {
    const ruleStrengths = buildRuleStrengths(input.activeFacts, input.assetInventoryData, input.insights);
    const fallbackIkigai = buildIkigaiTemplate({
      hasAssetReport: input.assetReport.hasReport,
      strengths: ruleStrengths,
      assetInventoryData: input.assetInventoryData,
      insights: input.insights
    });

    return this.profileNarrativeService.enrich({
      strengthsVisible: input.profileMeta.visibility.strengths,
      traitsVisible: input.profileMeta.visibility.traits,
      ikigaiVisible: input.profileMeta.visibility.ikigai,
      hasAssetReport: input.assetReport.hasReport,
      strengthsEvidence: collectStrengthEvidence(input.activeFacts, input.assetInventoryData, input.insights),
      traitEvidence: collectTraitEvidence(input.activeFacts),
      ikigaiEvidence: {
        strengths: ruleStrengths,
        ...collectIkigaiSignals(input.assetInventoryData),
        projectName: String(input.insights.activeProject?.name || "").trim(),
        artifactTitle: String(input.insights.latestArtifact?.title || "").trim(),
        feedbackSummary: String(input.insights.latestFeedbackSummary || "").trim()
      },
      ruleStrengths,
      templateIkigai: fallbackIkigai
    });
  }

  // Phase 1.5 —— 资产盘点续盘状态，供 /bootstrap + app.js 二次登录跳转使用
  // Phase 2·1 —— 优先读 User.hasAssetRadar flag（权威字段），flow state 作为细节补充
  async getAssetResumeStatus(userId?: string | null): Promise<{
    hasReport: boolean;
    inProgress: boolean;
    workflowKey: "firstInventory" | "resumeInventory" | "reviewUpdate";
    lastConversationId: string | null;
    resumePrompt: string | null;
  }> {
    const resolvedUserId = String(userId || "").trim();
    if (!resolvedUserId) {
      return {
        hasReport: false,
        inProgress: false,
        workflowKey: "firstInventory",
        lastConversationId: null,
        resumePrompt: null
      };
    }

    // Phase 2·1: User.hasAssetRadar 是权威 flag，优先读
    const userRow = await this.prisma.user.findFirst({
      where: { id: resolvedUserId, deletedAt: null },
      select: { hasAssetRadar: true }
    });
    const flagHasReport = !!userRow?.hasAssetRadar;

    const { flowState } = await this.getAssetInventoryFlowContext(resolvedUserId);
    const asStr = (value: unknown) => String(value || "").trim();
    const conversationId = asStr(flowState.conversationId);
    const inventoryStage = asStr(flowState.inventoryStage);
    const profileSnapshot = asStr(flowState.profileSnapshot);
    const dimensionReports = asStr(flowState.dimensionReports);
    const nextQuestion = asStr(flowState.nextQuestion);
    const finalReport = asStr(flowState.finalReport);
    const lastReportGeneratedAt = asStr(flowState.lastReportGeneratedAt);

    // flag 优先；flag=false 时仍允许 flow state 判断（兼容历史数据）
    const hasCompletedReport =
      flagHasReport ||
      inventoryStage === "report_generated" ||
      !!finalReport ||
      !!lastReportGeneratedAt;

    let workflowKey: "firstInventory" | "resumeInventory" | "reviewUpdate" = "firstInventory";
    let inProgress = false;
    let resumePrompt: string | null = null;

    if (hasCompletedReport && profileSnapshot && dimensionReports) {
      workflowKey = "reviewUpdate";
      resumePrompt = "我想根据最近的新变化更新我的资产盘点。";
    } else {
      const hasExistingProgress =
        !!conversationId ||
        !!profileSnapshot ||
        !!dimensionReports ||
        !!nextQuestion ||
        ["opening", "passion_values", "ability", "resource", "cognition", "relationship", "correction_loop", "ready_for_report"].includes(
          inventoryStage
        );

      if (hasExistingProgress) {
        workflowKey = "resumeInventory";
        inProgress = true;
        resumePrompt = "我们继续上次没完成的资产盘点。";
      }
    }

    // 上次 Dify conversation 对应的本地 Conversation 如果还没删，带回给前端，便于直接落到那一屏
    let lastConversationId: string | null = null;
    if (conversationId) {
      const provider = await this.prisma.providerConversation.findFirst({
        where: {
          providerConversationId: conversationId,
          conversation: {
            userId: resolvedUserId,
            deletedAt: null
          }
        },
        select: { conversationId: true }
      });
      if (provider) {
        lastConversationId = provider.conversationId;
      }
    }

    return {
      hasReport: hasCompletedReport,
      inProgress,
      workflowKey,
      lastConversationId,
      resumePrompt
    };
  }

  async updateAssetInventoryFromFlowState(
    userId: string,
    input: {
      conversationId: string;
      inventoryStage?: unknown;
      reviewStage?: unknown;
      profileSnapshot?: unknown;
      dimensionReports?: unknown;
      nextQuestion?: unknown;
      changeSummary?: unknown;
      reportBrief?: unknown;
      finalReport?: unknown;
      reportVersion?: unknown;
      lastReportGeneratedAt?: unknown;
      reportStatus?: unknown;
      reportError?: unknown;
      assetWorkflowKey?: unknown;
      isReview?: unknown;
    }
  ) {
    const snapshot = await this.ensureSnapshot(userId, SnapshotKind.ASSET_INVENTORY, DEFAULT_ASSET_INVENTORY_DATA);
    const current = readJsonObject(snapshot.data, DEFAULT_ASSET_INVENTORY_DATA);
    const merged = mergeAssetInventoryWithFlowState(current, input);

    await this.prisma.reportSnapshot.upsert({
      where: {
        userId_kind: {
          userId,
          kind: SnapshotKind.ASSET_INVENTORY
        }
      },
      create: {
        userId,
        kind: SnapshotKind.ASSET_INVENTORY,
        data: merged as Prisma.InputJsonValue
      },
      update: {
        data: merged as Prisma.InputJsonValue
      }
    });

    return merged;
  }

  async recoverStalePendingAssetReport(
    userId: string,
    options?: {
      staleAfterMs?: number;
      now?: Date;
    }
  ) {
    const snapshot = await this.ensureSnapshot(userId, SnapshotKind.ASSET_INVENTORY, DEFAULT_ASSET_INVENTORY_DATA);
    const current = readJsonObject(snapshot.data, DEFAULT_ASSET_INVENTORY_DATA);
    const currentFlowState = readJsonObject(
      current.flowState,
      DEFAULT_ASSET_INVENTORY_DATA.flowState as Record<string, unknown>
    );
    const reportStatus = String(currentFlowState.reportStatus || "").trim().toLowerCase();
    if (reportStatus !== "pending") {
      return null;
    }

    const staleAfterMs = Math.max(1, Number(options?.staleAfterMs || 15 * 60 * 1000));
    const now = options?.now ?? new Date();
    const ageMs = Math.max(0, now.getTime() - snapshot.updatedAt.getTime());
    if (ageMs < staleAfterMs) {
      return null;
    }

    const conversationId = String(currentFlowState.conversationId || "").trim();
    const merged = mergeAssetInventoryWithFlowState(current, {
      conversationId,
      reportStatus: "failed",
      reportError: "报告生成超时，请重新生成"
    });

    await this.prisma.reportSnapshot.update({
      where: {
        userId_kind: {
          userId,
          kind: SnapshotKind.ASSET_INVENTORY
        }
      },
      data: {
        data: merged as Prisma.InputJsonValue
      }
    });

    return merged;
  }

  private async persistProfileArtifacts(
    userId: string,
    insights: Awaited<ReturnType<typeof collectUserInsights>>,
    profileOverride?: Record<string, unknown>
  ) {
    const profileSnapshot = await this.ensureSnapshot(userId, SnapshotKind.PROFILE, DEFAULT_PROFILE_DATA);
    const fallbackProfile = readJsonObject(profileSnapshot.data, DEFAULT_PROFILE_DATA);
    const profile = profileOverride || {
      ...fallbackProfile,
      byline: insights.byline,
      radar: fallbackProfile.radar,
      strengths: fallbackProfile.strengths,
      traits: fallbackProfile.traits,
      ikigai: fallbackProfile.ikigai,
      stageLabel: buildStageLabel("", 0, String(insights.stageLabel || fallbackProfile.stageLabel || "")),
      growthSummary: `最近 30 天你完成了 ${insights.monthly.completedTasks} 项任务、生成 ${insights.monthly.artifacts} 张成果卡，目前处在「${insights.stageLabel || "成长中"}」。`
    };
    const inventorySnapshot = await this.ensureSnapshot(userId, SnapshotKind.ASSET_INVENTORY, DEFAULT_ASSET_INVENTORY_DATA);
    const fallbackInventory = readJsonObject(inventorySnapshot.data, DEFAULT_ASSET_INVENTORY_DATA);
    const assetInventory = {
      ...fallbackInventory,
      ...buildAssetInventorySnapshot(insights, profile)
    };

    await this.prisma.$transaction([
      this.prisma.reportSnapshot.upsert({
        where: {
          userId_kind: {
            userId,
            kind: SnapshotKind.PROFILE
          }
        },
        create: {
          userId,
          kind: SnapshotKind.PROFILE,
          data: profile as Prisma.InputJsonValue
        },
        update: {
          data: profile as Prisma.InputJsonValue
        }
      }),
      this.prisma.reportSnapshot.upsert({
        where: {
          userId_kind: {
            userId,
            kind: SnapshotKind.ASSET_INVENTORY
          }
        },
        create: {
          userId,
          kind: SnapshotKind.ASSET_INVENTORY,
          data: assetInventory as Prisma.InputJsonValue
        },
        update: {
          data: assetInventory as Prisma.InputJsonValue
        }
      })
    ]);

    return {
      profile,
      assetInventory,
      fallbackProfile
    };
  }

  private async ensureSnapshot(userId: string, kind: SnapshotKind, fallbackData: Prisma.JsonObject) {
    let snapshot = await this.prisma.reportSnapshot.findUnique({
      where: {
        userId_kind: {
          userId,
          kind
        }
      }
    });

    if (!snapshot) {
      snapshot = await this.prisma.reportSnapshot.create({
        data: {
          userId,
          kind,
          data: fallbackData
        }
      });
    }

    return snapshot;
  }
}

function buildStageLabel(stage: string, streakDays: number, fallback: string) {
  const safeStage = String(stage || "").trim();
  if (!safeStage) {
    return fallback;
  }

  if (Number.isFinite(streakDays) && streakDays > 0) {
    return `${safeStage} · 连续打卡 ${streakDays} 天`;
  }

  return safeStage;
}

function mergeAssetInventoryWithFlowState(
  current: Record<string, unknown>,
  input: {
    conversationId: string;
    inventoryStage?: unknown;
    reviewStage?: unknown;
    profileSnapshot?: unknown;
    dimensionReports?: unknown;
    nextQuestion?: unknown;
    changeSummary?: unknown;
    reportBrief?: unknown;
    finalReport?: unknown;
    reportVersion?: unknown;
    lastReportGeneratedAt?: unknown;
    reportStatus?: unknown;
    reportError?: unknown;
    assetWorkflowKey?: unknown;
    isReview?: unknown;
  }
) {
  const currentFlowState = readJsonObject(
    current.flowState,
    DEFAULT_ASSET_INVENTORY_DATA.flowState as Record<string, unknown>
  );
  const flowState = {
    conversationId: normalizeText(input.conversationId || currentFlowState.conversationId),
    inventoryStage: pickFlowText(input, "inventoryStage", currentFlowState.inventoryStage),
    reviewStage: pickFlowText(input, "reviewStage", currentFlowState.reviewStage),
    profileSnapshot: pickFlowText(input, "profileSnapshot", currentFlowState.profileSnapshot),
    dimensionReports: pickFlowText(input, "dimensionReports", currentFlowState.dimensionReports),
    nextQuestion: pickFlowText(input, "nextQuestion", currentFlowState.nextQuestion),
    changeSummary: pickFlowText(input, "changeSummary", currentFlowState.changeSummary),
    reportBrief: pickFlowText(input, "reportBrief", currentFlowState.reportBrief),
    finalReport: pickFlowText(input, "finalReport", currentFlowState.finalReport),
    reportVersion: pickFlowText(input, "reportVersion", currentFlowState.reportVersion),
    lastReportGeneratedAt: pickFlowText(input, "lastReportGeneratedAt", currentFlowState.lastReportGeneratedAt),
    reportStatus: pickFlowText(input, "reportStatus", currentFlowState.reportStatus),
    reportError: pickFlowText(input, "reportError", currentFlowState.reportError),
    assetWorkflowKey: pickFlowText(input, "assetWorkflowKey", currentFlowState.assetWorkflowKey),
    isReview: pickFlowText(input, "isReview", currentFlowState.isReview),
    syncedAt: new Date().toISOString()
  };

  const currentFlowSections = readJsonObject(
    current.flowSections,
    DEFAULT_ASSET_INVENTORY_DATA.flowSections as Record<string, unknown>
  );
  const profileSections = parseTitledSections(flowState.profileSnapshot);
  const dimensionSections = parseTitledSections(flowState.dimensionReports);
  const finalReportSections = parseTitledSections(flowState.finalReport);
  const realCases = buildFlowRealCases(profileSections, current.realCases);
  const mergedPendingQuestions = compactUnique([
    flowState.nextQuestion,
    ...(Array.isArray(current.pendingQuestions) ? current.pendingQuestions.map((item) => String(item || "")) : [])
  ]).slice(0, 6);

  return {
    ...current,
    summary: resolveFlowSummary(current.summary, flowState),
    stageLabel: resolveStageLabel(current.stageLabel, flowState.inventoryStage),
    realCases,
    pendingQuestions: mergedPendingQuestions,
    assetDimensions: mergeFlowDimensions(current.assetDimensions, flowState.inventoryStage, profileSections, dimensionSections),
    monetizationJudgement: mergeMonetizationJudgement(current.monetizationJudgement, profileSections, flowState.nextQuestion),
    flowState,
    flowSections: {
      ...currentFlowSections,
      profileSnapshot: profileSections,
      dimensionReports: dimensionSections,
      finalReport: finalReportSections
    }
  };
}

function parseTitledSections(text: string) {
  const sections: Record<string, string[]> = {};
  let currentKey = "";
  String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .forEach((line) => {
      if (!line) {
        return;
      }
      // 1) 旧格式:【标题】 —— profileSnapshot 仍在使用
      const bracketMatch = line.match(/^【(.+?)】$/);
      if (bracketMatch) {
        currentKey = bracketMatch[1].trim();
        if (!sections[currentKey]) {
          sections[currentKey] = [];
        }
        return;
      }
      // 2) Dify 4-报告生成流 输出的中文序号标题，可带 markdown 前缀:
      //    "一、资产总览" 或 "### 一、资产总览" 或 "## 二、四大资产维度画像"
      const chineseNumberedMatch = line.match(
        /^(?:#{1,6}\s*)?[一二三四五六七八九十]+、\s*(.+?)\s*$/
      );
      if (chineseNumberedMatch) {
        const title = chineseNumberedMatch[1]
          .trim()
          .replace(/\*+$/, "")
          .replace(/^\*+/, "")
          .trim();
        if (title) {
          currentKey = title;
          if (!sections[currentKey]) {
            sections[currentKey] = [];
          }
          return;
        }
      }

      if (!currentKey) {
        return;
      }

      sections[currentKey].push(line);
    });

  return sections;
}

function buildFlowRealCases(profileSections: Record<string, string[]>, fallback: unknown) {
  const lines = profileSections["真实案例"] || [];
  if (!lines.length) {
    return Array.isArray(fallback) ? fallback : [];
  }

  return lines
    .map((line, index) => ({
      id: `flow_case_${index + 1}`,
      title: `真实案例 ${index + 1}`,
      summary: stripBullet(line),
      evidence: stripBullet(line),
      source: "dify_flow"
    }))
    .slice(0, 4);
}

function mergeFlowDimensions(
  current: unknown,
  inventoryStage: string,
  profileSections: Record<string, string[]>,
  dimensionSections: Record<string, string[]>
) {
  const fallback = isRecord(current)
    ? current as Record<string, unknown>
    : readJsonObject(DEFAULT_ASSET_INVENTORY_DATA.assetDimensions, {} as Record<string, unknown>);

  return {
    ability: mergeOneDimension(
      fallback.ability,
      inventoryStage,
      "ability",
      profileSections["能力资产"],
      dimensionSections["能力资产小报告"]
    ),
    resource: mergeOneDimension(
      fallback.resource,
      inventoryStage,
      "resource",
      profileSections["资源资产"],
      dimensionSections["资源资产小报告"]
    ),
    cognition: mergeOneDimension(
      fallback.cognition,
      inventoryStage,
      "cognition",
      profileSections["认知资产"],
      dimensionSections["认知资产小报告"]
    ),
    relationship: mergeOneDimension(
      fallback.relationship,
      inventoryStage,
      "relationship",
      profileSections["关系资产"],
      dimensionSections["关系资产小报告"]
    )
  };
}

function mergeOneDimension(
  current: unknown,
  inventoryStage: string,
  dimensionKey: "ability" | "resource" | "cognition" | "relationship",
  profileLines?: string[],
  reportLines?: string[]
) {
  const base = isRecord(current) ? current as Record<string, unknown> : {};
  const assets = compactUnique([...(profileLines || []).map(stripBullet), ...extractAssetsFromReport(reportLines)]);
  const evidence = compactUnique([...(reportLines || []).map(stripBullet), ...(profileLines || []).map(stripBullet)]).slice(0, 4);

  return {
    ...base,
    status: resolveFlowDimensionStatus(dimensionKey, inventoryStage, assets.length, String(base.status || "")),
    assets: assets.length ? assets : Array.isArray(base.assets) ? base.assets : [],
    evidence: evidence.length ? evidence : Array.isArray(base.evidence) ? base.evidence : [],
    nextGap: reportLines?.length ? [] : Array.isArray(base.nextGap) ? base.nextGap : []
  };
}

function extractAssetsFromReport(lines?: string[]) {
  if (!Array.isArray(lines)) {
    return [];
  }

  return lines
    .filter((line) => /^-\s*已识别资产[:：]/.test(line) || /^-\s*可调用资源[:：]/.test(line) || /^-\s*独特判断[:：]/.test(line) || /^-\s*信任网络[:：]/.test(line))
    .flatMap((line) => splitChineseList(line.replace(/^-\s*[^:：]+[:：]/, "")));
}

function mergeMonetizationJudgement(current: unknown, profileSections: Record<string, string[]>, nextQuestion: string) {
  const base = isRecord(current) ? current as Record<string, unknown> : {};
  const internalLines = profileSections["内部判断"] || [];
  const strongAssets = extractSectionValues(internalLines, "强资产");
  const potentialAssets = extractSectionValues(internalLines, "潜力资产");
  const weakOrMisjudged = extractSectionValues(internalLines, "弱项或误判项");
  const nextToVerify = compactUnique([
    nextQuestion,
    ...extractSectionValues(internalLines, "待补事实"),
    ...(Array.isArray(base.nextToVerify) ? base.nextToVerify.map((item) => String(item || "")) : [])
  ]).slice(0, 6);

  return {
    ...base,
    strongAssets: strongAssets.length ? strongAssets : Array.isArray(base.strongAssets) ? base.strongAssets : [],
    potentialAssets: potentialAssets.length ? potentialAssets : Array.isArray(base.potentialAssets) ? base.potentialAssets : [],
    weakOrMisjudged: weakOrMisjudged.length ? weakOrMisjudged : Array.isArray(base.weakOrMisjudged) ? base.weakOrMisjudged : [],
    nextToVerify
  };
}

function extractSectionValues(lines: string[], label: string) {
  const matched = lines.find((line) => new RegExp(`^-\\s*${escapeRegExp(label)}[:：]`).test(line));
  if (!matched) {
    return [];
  }
  return splitChineseList(matched.replace(new RegExp(`^-\\s*${escapeRegExp(label)}[:：]`), ""));
}

function resolveFlowSummary(currentSummary: unknown, flowState: Record<string, string>) {
  if (flowState.finalReport) {
    const firstParagraph = flowState.finalReport
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean);
    if (firstParagraph) {
      return firstParagraph;
    }
  }

  if (flowState.reportBrief) {
    return flowState.reportBrief;
  }

  return String(currentSummary || "").trim();
}

function resolveStageLabel(currentStageLabel: unknown, inventoryStage: string) {
  const stageMap: Record<string, string> = {
    opening: "资产探索期",
    ability: "能力盘点中",
    resource: "资源盘点中",
    cognition: "认知盘点中",
    relationship: "关系盘点中",
    ready_for_report: "总结成型中",
    correction_loop: "强纠偏中",
    report_generated: "资产报告已生成"
  };

  return stageMap[inventoryStage] || String(currentStageLabel || "").trim();
}

function resolveFlowDimensionStatus(
  dimensionKey: "ability" | "resource" | "cognition" | "relationship",
  inventoryStage: string,
  assetCount: number,
  fallback: string
) {
  const order: Array<typeof dimensionKey> = ["ability", "resource", "cognition", "relationship"];
  const stageMap: Record<string, typeof dimensionKey | null> = {
    opening: null,
    ability: "ability",
    resource: "resource",
    cognition: "cognition",
    relationship: "relationship",
    ready_for_report: null,
    correction_loop: null,
    report_generated: null
  };

  const active = stageMap[inventoryStage];
  if (inventoryStage === "ready_for_report" || inventoryStage === "report_generated") {
    return assetCount > 0 ? "已完成" : fallback || "已完成";
  }
  if (!active) {
    return assetCount > 0 ? fallback || "已出现" : fallback || "待确认";
  }

  if (dimensionKey === active) {
    return "进行中";
  }

  if (order.indexOf(dimensionKey) < order.indexOf(active)) {
    return "已完成";
  }

  return assetCount > 0 ? fallback || "已出现" : "待确认";
}

function readFlowSectionMap(data: Record<string, unknown>, key: "profileSnapshot" | "dimensionReports" | "finalReport") {
  const flowSections = isRecord(data.flowSections) ? (data.flowSections as Record<string, unknown>) : {};
  const target = flowSections[key];
  return isRecord(target) ? (target as Record<string, string[]>) : {};
}

function countNonEmptyProfileSections(sections: Record<string, string[]>) {
  const labels = ["真实案例", "能力资产", "资源资产", "认知资产", "关系资产"];
  return labels.reduce((count, label) => {
    return count + ((Array.isArray(sections[label]) && sections[label].some(Boolean)) ? 1 : 0);
  }, 0);
}

function readRadarDimensions(currentRadarProfile: { profileData: Prisma.JsonValue; sourceFactCount: number } | null): AssetRadarDimension[] {
  if (!currentRadarProfile || !isRecord(currentRadarProfile.profileData)) {
    return [];
  }

  const dimensions = Array.isArray(currentRadarProfile.profileData.dimensions)
    ? currentRadarProfile.profileData.dimensions
    : [];

  return dimensions.reduce<AssetRadarDimension[]>((acc, item) => {
    if (!isRecord(item)) {
      return acc;
    }

    const label = normalizeText(item.label);
    if (!label) {
      return acc;
    }

    acc.push({
      label,
      value: clampPercent(item.score),
      factCount: Number(item.factCount) || 0
    });
    return acc;
  }, []);
}

function buildEmptyRadar() {
  return [
    { label: "能力", value: 0 },
    { label: "资源", value: 0 },
    { label: "认知", value: 0 },
    { label: "关系", value: 0 }
  ];
}

function readAssetDimensionScores(assetInventoryData: Record<string, unknown>): AssetRadarDimension[] {
  const assetDimensions = isRecord(assetInventoryData.assetDimensions)
    ? (assetInventoryData.assetDimensions as Record<string, unknown>)
    : {};
  const mapping: Array<{ key: "ability" | "resource" | "cognition" | "relationship"; label: string }> = [
    { key: "ability", label: "能力" },
    { key: "resource", label: "资源" },
    { key: "cognition", label: "认知" },
    { key: "relationship", label: "关系" }
  ];

  return mapping.map((item) => {
    const record = isRecord(assetDimensions[item.key]) ? (assetDimensions[item.key] as Record<string, unknown>) : {};
    return {
      label: item.label,
      value: clampPercent(record.score)
    };
  });
}

function collectTraitFacts(facts: ActiveUserFact[]) {
  const categories = new Set<UserFactCategory>([
    UserFactCategory.behavior,
    UserFactCategory.personality,
    UserFactCategory.preference
  ]);
  return facts.filter((fact) => categories.has(fact.category));
}

function collectIkigaiSignals(assetInventoryData: Record<string, unknown>) {
  const fourCircleSignals = isRecord(assetInventoryData.fourCircleSignals)
    ? (assetInventoryData.fourCircleSignals as Record<string, unknown>)
    : {};
  const love = extractStringArray(fourCircleSignals.love, 4);
  const worldNeeds = extractStringArray(fourCircleSignals.worldNeeds, 5);
  const willingToPay = extractStringArray(fourCircleSignals.willingToPay, 5);
  const signalBuckets = [love.length, worldNeeds.length, willingToPay.length].filter((count) => count > 0).length;
  const hasDirectionalSignal = worldNeeds.length > 0 || willingToPay.length > 0;

  return {
    love,
    worldNeeds,
    willingToPay,
    signalBuckets,
    hasDirectionalSignal
  };
}

function buildIkigaiVisibility(
  signals: ReturnType<typeof collectIkigaiSignals>,
  insights: UserInsights
) {
  const buckets = [
    signals.love.length ? "love" : "",
    signals.worldNeeds.length ? "worldNeeds" : "",
    signals.willingToPay.length ? "willingToPay" : "",
    insights.activeProject?.name ? "project" : "",
    insights.latestArtifact?.title ? "artifact" : "",
    insights.latestFeedbackSummary ? "feedback" : ""
  ].filter(Boolean);

  const hasDirectionalSignal = signals.hasDirectionalSignal || !!insights.activeProject?.name || !!insights.latestArtifact?.title;
  return buckets.length >= 3 && hasDirectionalSignal;
}

function buildRuleStrengths(
  facts: ActiveUserFact[],
  assetInventoryData: Record<string, unknown>,
  insights: UserInsights
) {
  const labels: string[] = [];
  const factText = facts.map((fact) => `${fact.factKey} ${fact.factValue}`).join("\n");

  if (/(问题|拆解|分析|判断|诊断|复盘)/.test(factText)) {
    labels.push("问题拆解");
  }
  if (/(项目|推进|落地|执行|交付)/.test(factText)) {
    labels.push("执行推进");
  }
  if (/(结构|整理|方法|框架)/.test(factText)) {
    labels.push("结构化认知");
  }
  if (/(资源|组织|渠道|合作|整合)/.test(factText)) {
    labels.push("资源整合");
  }
  if (/(客户|关系|转介绍|信任|跟进)/.test(factText)) {
    labels.push("关系连接");
  }
  if (/(ai|自动化|模型|流程)/i.test(factText)) {
    labels.push("AI应用");
  }

  const strongAssets = isRecord(assetInventoryData.monetizationJudgement)
    ? extractStringArray((assetInventoryData.monetizationJudgement as Record<string, unknown>).strongAssets, 4)
    : [];
  strongAssets.forEach((item) => labels.push(item));

  if (insights.latestArtifact?.type === "pricing") {
    labels.push("报价设计");
  }
  if (insights.latestArtifact?.type === "score") {
    labels.push("机会判断");
  }

  return compactUnique(labels).slice(0, 4);
}

function collectStrengthEvidence(
  facts: ActiveUserFact[],
  assetInventoryData: Record<string, unknown>,
  insights: UserInsights
) {
  const dimensionFacts = facts
    .filter((fact) => !!fact.dimension && fact.confidence >= 0.5)
    .slice(0, 6)
    .map((fact) => ({
      key: fact.factKey,
      text: fact.factValue.slice(0, 120),
      source: `fact:${fact.dimension}`
    }));
  const profileSections = readFlowSectionMap(assetInventoryData, "profileSnapshot");
  const sectionEvidence = ["能力资产", "资源资产", "认知资产", "关系资产"]
    .flatMap((label) => (profileSections[label] || []).slice(0, 1).map((line, index) => ({
      key: `${label}_${index + 1}`,
      text: stripBullet(line).slice(0, 120),
      source: `flow:${label}`
    })));
  const artifactEvidence = insights.latestArtifact
    ? [{
        key: `artifact_${String(insights.latestArtifact.id || "latest")}`,
        text: `${String(insights.latestArtifact.title || "").trim()} ${String(insights.latestArtifact.summary || "").trim()}`.trim().slice(0, 120),
        source: "artifact"
      }]
    : [];
  const feedbackEvidence = insights.latestFeedbackSummary
    ? [{
        key: "feedback_latest",
        text: String(insights.latestFeedbackSummary || "").trim().slice(0, 120),
        source: "feedback"
      }]
    : [];

  return [...dimensionFacts, ...sectionEvidence, ...artifactEvidence, ...feedbackEvidence].slice(0, 8);
}

function collectTraitEvidence(facts: ActiveUserFact[]) {
  const primary = collectTraitFacts(facts).slice(0, 6);
  const supplements = facts
    .filter((fact) => fact.category === UserFactCategory.experience)
    .slice(0, Math.max(0, 6 - primary.length));

  return [...primary, ...supplements].map((fact) => ({
    key: fact.factKey,
    text: fact.factValue.slice(0, 120),
    source: `fact:${fact.category}`
  }));
}

function buildIkigaiTemplate(input: {
  hasAssetReport: boolean;
  strengths: string[];
  assetInventoryData: Record<string, unknown>;
  insights: UserInsights;
}) {
  if (!input.hasAssetReport) {
    return "";
  }

  const projectName = String(input.insights.activeProject?.name || "当前主线").trim() || "当前主线";
  const keyStrength = String(input.strengths[0] || "可交付能力").trim() || "可交付能力";
  const artifactTitle = String(input.insights.latestArtifact?.title || "成果卡片").trim() || "成果卡片";
  const willingToPay = collectIkigaiSignals(input.assetInventoryData).willingToPay[0] || "更明确的付费场景";

  return `你正在把「${keyStrength}」收口成围绕「${projectName}」的可交付能力。下一步最值得做的，是把「${artifactTitle}」继续打磨成能对应${willingToPay}的结果。`;
}

function normalizeText(value: unknown) {
  return String(value || "").trim();
}

function extractStringArray(value: unknown, limit: number) {
  if (!Array.isArray(value)) {
    return [];
  }

  return compactUnique(
    value.map((item) => String(item || "").trim())
  ).slice(0, limit);
}

function clampPercent(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(numeric)));
}

function pickFlowText<T extends Record<string, unknown>>(
  input: T,
  key: keyof T,
  fallback: unknown
) {
  if (Object.prototype.hasOwnProperty.call(input, key)) {
    return normalizeText(input[key]);
  }

  return normalizeText(fallback);
}

function stripBullet(line: string) {
  return String(line || "").replace(/^-\s*/, "").trim();
}

function splitChineseList(value: string) {
  return compactUnique(
    String(value || "")
      .split(/[、，,；;]|(?<!\d)\s+/)
      .map((item) => item.trim())
      .filter(Boolean)
  );
}

function compactUnique(values: Array<string | null | undefined>) {
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

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
