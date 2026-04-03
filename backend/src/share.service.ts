import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, SnapshotKind } from "@prisma/client";
import { Resvg } from "@resvg/resvg-js";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import * as path from "node:path";
import { PrismaService } from "./shared/prisma.service";
import { DEFAULT_SHARE_PREVIEW } from "./shared/templates";
import { readJsonObject } from "./shared/json";
import { UserService } from "./user.service";
import { getAppConfig } from "./shared/app-config";
import { buildDynamicSharePreview, collectUserInsights } from "./shared/user-insights";

@Injectable()
export class ShareService {
  private readonly config = getAppConfig();

  constructor(
    private readonly prisma: PrismaService,
    private readonly userService: UserService
  ) {}

  async getSharePreview(userId: string) {
    const { preview } = await this.composeSharePreview(userId);
    return preview;
  }

  async generateShareImage(userId: string, payload: Record<string, unknown>) {
    const { preview } = await this.composeSharePreview(userId, payload);
    const posterId = `poster-${Date.now()}`;
    const postersDir = path.join(this.config.storageDir, "posters");
    const posterPath = path.join(postersDir, `${posterId}.png`);
    const imageUrl = `${this.config.publicBaseUrl.replace(/\/+$/, "")}/share/posters/${posterId}.png`;
    const posterBuffer = renderPosterPng(preview);

    await mkdir(postersDir, {
      recursive: true
    });
    await writeFile(posterPath, posterBuffer);

    await this.prisma.shareRecord.create({
      data: {
        id: posterId,
        userId,
        resultId: readString(payload.resultId, 128),
        title: readString(payload.title || payload.resultTitle, 200),
        caption: readString(payload.caption || preview.caption, 5000),
        hashtags: Array.isArray(preview.hashtags) ? preview.hashtags : [],
        posterPath,
        imageUrl
      }
    });

    return {
      posterId,
      imageUrl
    };
  }

  async buildShareCaption(userId: string, payload: Record<string, unknown>) {
    const { preview } = await this.composeSharePreview(userId, payload);

    return {
      caption: String(preview.caption || ""),
      hashtags: Array.isArray(preview.hashtags) ? preview.hashtags : []
    };
  }

  async shareResult(userId: string, payload: Record<string, unknown>) {
    const shareId = `share-${Date.now()}`;
    const captionResult = await this.buildShareCaption(userId, payload);

    await this.prisma.shareRecord.create({
      data: {
        id: shareId,
        userId,
        resultId: readString(payload.resultId, 128),
        title: readString(payload.title || payload.resultTitle, 200),
        caption: captionResult.caption,
        hashtags: captionResult.hashtags
      }
    });

    return {
      success: true,
      shareId,
      resultId: payload.resultId || null
    };
  }

  async getPoster(posterId: string) {
    const normalizedPosterId = String(posterId || "").replace(/\.png$/i, "").trim();
    const record = await this.prisma.shareRecord.findFirst({
      where: {
        id: normalizedPosterId
      }
    });

    if (!record || !record.posterPath) {
      throw new NotFoundException(`Poster not found: ${normalizedPosterId}`);
    }

    return {
      buffer: await readFile(record.posterPath),
      mimeType: "image/png"
    };
  }

  private async ensureSharePreview(userId: string) {
    await this.userService.getUserOrDemo(userId);

    let snapshot = await this.prisma.reportSnapshot.findUnique({
      where: {
        userId_kind: {
          userId,
          kind: SnapshotKind.SHARE_PREVIEW
        }
      }
    });

    if (!snapshot) {
      snapshot = await this.prisma.reportSnapshot.create({
        data: {
          userId,
          kind: SnapshotKind.SHARE_PREVIEW,
          data: DEFAULT_SHARE_PREVIEW
        }
      });
    }

    return snapshot;
  }

  private async composeSharePreview(userId: string, payload: Record<string, unknown> = {}) {
    const snapshot = await this.ensureSharePreview(userId);
    const fallback = readJsonObject(snapshot.data, DEFAULT_SHARE_PREVIEW);
    const insights = await collectUserInsights(this.prisma, userId);
    const artifactPayload = await this.resolveArtifactPayload(userId, readString(payload.resultId, 128));
    const preview = buildDynamicSharePreview(insights, fallback, {
      ...artifactPayload,
      ...payload
    });

    await this.prisma.reportSnapshot.update({
      where: {
        id: snapshot.id
      },
      data: {
        data: preview as Prisma.InputJsonValue
      }
    });

    return {
      snapshot,
      preview
    };
  }

  private async resolveArtifactPayload(userId: string, resultId?: string) {
    if (!resultId) {
      return {};
    }

    const artifact = await this.prisma.projectArtifact.findFirst({
      where: {
        id: resultId,
        deletedAt: null,
        project: {
          userId,
          deletedAt: null
        }
      },
      select: {
        title: true,
        summary: true,
        meta: true,
        data: true
      }
    });

    if (!artifact) {
      return {};
    }

    const data = artifact.data && typeof artifact.data === "object" && !Array.isArray(artifact.data)
      ? artifact.data as Record<string, unknown>
      : {};

    return {
      title: artifact.title,
      resultTitle: artifact.title,
      quote: String(artifact.summary || artifact.meta || "").trim(),
      scores: Array.isArray(data.scores) ? data.scores : undefined
    };
  }
}

function readString(value: unknown, maxLength: number) {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  return trimmed.slice(0, maxLength);
}

function renderPosterPng(preview: Record<string, unknown>) {
  const svg = buildPosterSvg(preview);
  const resvg = new Resvg(svg, {
    fitTo: {
      mode: "width",
      value: 1080
    },
    font: {
      loadSystemFonts: true,
      defaultFontFamily: "sans-serif"
    }
  });

  return resvg.render().asPng();
}

function buildPosterSvg(preview: Record<string, unknown>) {
  const subtitle = escapeXml(String(preview.subtitle || "一树OPC / 我的成长卡"));
  const titleLines = splitTextLines(String(preview.title || "我的成长卡片"), 10, 2).map(escapeXml);
  const quoteLines = splitTextLines(String(preview.quote || ""), 20, 2).map(escapeXml);
  const captionLines = splitTextLines(String(preview.caption || ""), 20, 4).map(escapeXml);
  const hashtags = Array.isArray(preview.hashtags) ? preview.hashtags.map((item) => String(item || "").trim()).filter(Boolean) : [];
  const bars = Array.isArray(preview.bars) ? preview.bars.slice(0, 5) : [];

  const barMarkup = bars
    .map((bar, index) => {
      const top = 360 + index * 92;
      const label = escapeXml(String(bar.label || ""));
      const value = Math.max(0, Math.min(100, Number(bar.value || 0)));
      return `
        <text x="96" y="${top}" font-size="40" fill="#FFFFFF" opacity="0.88">${label}</text>
        <rect x="96" y="${top + 26}" width="700" height="18" rx="9" fill="rgba(255,255,255,0.18)" />
        <rect x="96" y="${top + 26}" width="${700 * (value / 100)}" height="18" rx="9" fill="#7B67F6" />
      `;
    })
    .join("");

  const hashtagMarkup = hashtags
    .slice(0, 3)
    .map((tag, index) => {
      const x = 86 + index * 210;
      return `
        <rect x="${x}" y="1544" width="186" height="54" rx="27" fill="#F2EEFF" />
        <text x="${x + 93}" y="1580" text-anchor="middle" font-size="30" fill="#6C55E8">${escapeXml(tag)}</text>
      `;
    })
    .join("");

  const titleMarkup = titleLines
    .map((line, index) => `<text x="96" y="${178 + index * 74}" font-size="68" font-weight="700" fill="#FFFFFF">${line}</text>`)
    .join("");
  const quoteMarkup = quoteLines
    .map((line, index) => `<text x="96" y="${862 + index * 44}" font-size="34" fill="#FFFFFF" opacity="0.82">${line}</text>`)
    .join("");
  const captionMarkup = captionLines
    .map((line, index) => `<text x="86" y="${1432 + index * 48}" font-size="38" fill="#17191D">${line}</text>`)
    .join("");

  return `
  <svg width="1080" height="1920" viewBox="0 0 1080 1920" xmlns="http://www.w3.org/2000/svg">
    <rect width="1080" height="1920" fill="#F3F4F6" />
    <rect x="56" y="92" width="968" height="1120" rx="44" fill="#0F1012" />
    <text x="96" y="142" font-size="34" fill="rgba(255,255,255,0.56)">${subtitle}</text>
    ${titleMarkup}
    <rect x="72" y="306" width="936" height="540" rx="32" fill="rgba(255,255,255,0.08)" />
    ${barMarkup}
    ${quoteMarkup}
    <text x="96" y="1114" font-size="44" fill="#FFFFFF">一树OPC</text>
    <rect x="828" y="980" width="136" height="136" rx="24" fill="rgba(255,255,255,0.12)" />
    <text x="896" y="1060" text-anchor="middle" font-size="28" fill="rgba(255,255,255,0.58)">小程序码</text>

    <rect x="56" y="1268" width="968" height="520" rx="38" fill="#FFFFFF" />
    <text x="86" y="1340" font-size="32" fill="#8D9097">建议文案</text>
    ${captionMarkup}
    ${hashtagMarkup}
    <text x="86" y="1666" font-size="30" fill="#A3A6AD">${escapeXml(String(preview.createdAt || ""))}</text>
  </svg>
  `;
}

function splitTextLines(text: string, maxLength: number, maxLines: number) {
  const safe = String(text || "").replace(/\s+/g, " ").trim();
  if (!safe) {
    return [];
  }

  const normalized = safe.split("\n").map((line) => line.trim()).filter(Boolean);
  const output: string[] = [];

  normalized.forEach((line) => {
    let cursor = line;
    while (cursor && output.length < maxLines) {
      output.push(cursor.slice(0, maxLength));
      cursor = cursor.slice(maxLength);
    }
  });

  if (!output.length) {
    return [];
  }

  if (output.length > maxLines) {
    return output.slice(0, maxLines);
  }

  const lastIndex = output.length - 1;
  if (safe.length > output.join("").length) {
    output[lastIndex] = `${output[lastIndex].slice(0, Math.max(0, maxLength - 1))}…`;
  }

  return output;
}

function escapeXml(value: string) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
