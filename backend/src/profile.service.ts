import { Injectable } from "@nestjs/common";
import { Prisma, SnapshotKind } from "@prisma/client";
import { PrismaService } from "./shared/prisma.service";
import { DEFAULT_ASSET_INVENTORY_DATA, DEFAULT_PROFILE_DATA } from "./shared/templates";
import { readJsonObject } from "./shared/json";
import { UserService } from "./user.service";
import { buildAssetInventorySnapshot, buildDynamicProfile, collectUserInsights } from "./shared/user-insights";

@Injectable()
export class ProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly userService: UserService
  ) {}

  async getProfile(userId?: string | null) {
    const user = await this.userService.getUserOrDemo(userId);
    const insights = await collectUserInsights(this.prisma, user.id);
    const { profile, fallbackProfile } = await this.persistProfileArtifacts(user.id, insights);
    const nextName = String(user.nickname || user.name || fallbackProfile.name || "小明").trim() || "小明";

    // 资产盘点报告原文:从 asset_inventory flowState 读取 finalReport 以便前端档案页展示
    const assetReport = await this.buildAssetReportForProfile(user.id);

    return {
      ...profile,
      name: nextName,
      initial: String(user.initial || nextName.slice(0, 1) || fallbackProfile.initial || "小").trim() || "小",
      avatarUrl: String(user.avatarUrl || fallbackProfile.avatarUrl || "").trim(),
      stageLabel: buildStageLabel(String(user.stage || ""), Number(user.streakDays), String(profile.stageLabel || "")),
      assetReport
    };
  }

  // 资产盘点报告视图数据——供 /profile 返回、供个人档案页「资产盘点报告」卡片使用
  private async buildAssetReportForProfile(userId: string): Promise<{
    hasReport: boolean;
    finalReport: string;
    reportBrief: string;
    reportVersion: string;
    generatedAt: string;
    isReview: boolean;
    sections: Array<{ title: string; lines: string[] }>;
  }> {
    const { flowState } = await this.getAssetInventoryFlowContext(userId);
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
    const user = await this.userService.getUserOrDemo(userId);
    const insights = await collectUserInsights(this.prisma, user.id);
    const { assetInventory } = await this.persistProfileArtifacts(user.id, insights);
    const nextName = String(user.nickname || user.name || assetInventory.profileName || "小明").trim() || "小明";

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
        ["opening", "ability", "resource", "cognition", "relationship", "correction_loop", "ready_for_report"].includes(
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

  private async persistProfileArtifacts(userId: string, insights: Awaited<ReturnType<typeof collectUserInsights>>) {
    const profileSnapshot = await this.ensureSnapshot(userId, SnapshotKind.PROFILE, DEFAULT_PROFILE_DATA);
    const fallbackProfile = readJsonObject(profileSnapshot.data, DEFAULT_PROFILE_DATA);
    const profile = buildDynamicProfile(insights, fallbackProfile);
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
      const titleMatch = line.match(/^【(.+?)】$/);
      if (titleMatch) {
        currentKey = titleMatch[1].trim();
        if (!sections[currentKey]) {
          sections[currentKey] = [];
        }
        return;
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

function normalizeText(value: unknown) {
  return String(value || "").trim();
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
