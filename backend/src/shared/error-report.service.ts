import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import axios from "axios";
import { getAppConfig } from "./app-config";
import { PrismaService } from "./prisma.service";

export type ErrorReportEntry = {
  source: "client" | "server";
  level?: "error" | "warn" | "fatal";
  userId?: string | null;
  requestId?: string | null;
  route?: string | null;
  message: string;
  stack?: string | null;
  context?: Record<string, unknown> | null;
  userAgent?: string | null;
  appVersion?: string | null;
};

/**
 * Phase B1：错误上报双通道。
 *   - 本地 DB（ErrorLog 表）：永远写，作为兜底可查的最终真相；
 *     哪怕 Sentry 挂了或没配置，线上 5xx 仍然能被追溯。
 *   - Sentry（可选）：配置 SENTRY_DSN 后，异步通过 envelope 协议直接打点，
 *     不拉 `@sentry/node` SDK，避免无谓引入 5MB+ 的依赖；
 *     未来需要 performance / breadcrumbs 时再切换到官方 SDK。
 */
@Injectable()
export class ErrorReportService {
  private readonly logger = new Logger(ErrorReportService.name);
  private readonly config = getAppConfig();
  private readonly sentryEndpoint = parseSentryDsn(this.config.sentryDsn);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * fire-and-forget：调用方不 await，失败只打 warn 日志，
   * 避免"写错误日志失败"反过来污染本来就在报错的请求。
   */
  record(entry: ErrorReportEntry): void {
    const row: Prisma.ErrorLogCreateInput = {
      source: entry.source,
      level: entry.level || "error",
      userId: truncate(entry.userId, 64),
      requestId: truncate(entry.requestId, 128),
      route: truncate(entry.route, 255),
      message: truncate(entry.message || "unknown_error", 1024) || "unknown_error",
      stack: entry.stack ? String(entry.stack) : null,
      context:
        entry.context && typeof entry.context === "object"
          ? (entry.context as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      userAgent: truncate(entry.userAgent, 512),
      appVersion: truncate(entry.appVersion, 64)
    };

    this.prisma.errorLog
      .create({ data: row })
      .catch((dbError) => {
        this.logger.warn(
          `failed to persist ErrorLog: ${dbError instanceof Error ? dbError.message : String(dbError)}`
        );
      });

    if (this.sentryEndpoint) {
      this.forwardToSentry(entry).catch((forwardErr) => {
        this.logger.warn(
          `Sentry forwarding failed: ${forwardErr instanceof Error ? forwardErr.message : String(forwardErr)}`
        );
      });
    }
  }

  /**
   * 走 Sentry envelope 协议 POST 一个 event。
   * 文档：https://develop.sentry.dev/sdk/envelopes/
   * 不用 @sentry/node 主要是因为我们当前只需要"把错误发过去"，
   * 不需要 transaction / performance tracing / breadcrumb。
   */
  private async forwardToSentry(entry: ErrorReportEntry) {
    if (!this.sentryEndpoint) return;

    const eventId = randomHex(32);
    const timestamp = Math.floor(Date.now() / 1000);
    const event = {
      event_id: eventId,
      timestamp,
      level: entry.level || "error",
      platform: "node",
      environment: this.config.sentryEnvironment,
      release: entry.appVersion || undefined,
      logger: entry.source,
      message: { formatted: entry.message },
      exception: entry.stack
        ? {
            values: [
              {
                type: "Error",
                value: entry.message,
                stacktrace: { frames: parseStackFrames(entry.stack) }
              }
            ]
          }
        : undefined,
      tags: {
        source: entry.source,
        route: entry.route || undefined
      },
      user: entry.userId ? { id: entry.userId } : undefined,
      request: {
        url: entry.route || undefined,
        headers: entry.userAgent ? { "User-Agent": entry.userAgent } : undefined
      },
      extra: entry.context || undefined
    };

    const envelope =
      JSON.stringify({ event_id: eventId, sent_at: new Date().toISOString() }) +
      "\n" +
      JSON.stringify({ type: "event" }) +
      "\n" +
      JSON.stringify(event);

    await axios.post(this.sentryEndpoint.url, envelope, {
      timeout: 3000,
      headers: {
        "Content-Type": "application/x-sentry-envelope",
        "X-Sentry-Auth": `Sentry sentry_version=7, sentry_key=${this.sentryEndpoint.publicKey}, sentry_client=opc-backend/0.1.0`
      },
      validateStatus: () => true
    });
  }
}

/**
 * 解析 Sentry DSN：https://<publicKey>@<host>/<projectId>
 * 返回 envelope 端点 URL 和 publicKey；解析失败返回 null 让上层直接跳过转发。
 */
function parseSentryDsn(dsn: string): { url: string; publicKey: string } | null {
  if (!dsn) return null;
  try {
    const url = new URL(dsn);
    const publicKey = url.username;
    const projectId = url.pathname.replace(/^\/+/, "").split("/").pop();
    if (!publicKey || !projectId) return null;
    return {
      url: `${url.protocol}//${url.host}/api/${projectId}/envelope/`,
      publicKey
    };
  } catch {
    return null;
  }
}

function truncate(value: unknown, max: number): string | null {
  if (value == null) return null;
  const source = String(value).trim();
  if (!source) return null;
  return source.length > max ? source.slice(0, max) : source;
}

function randomHex(bytes: number) {
  const chars = "0123456789abcdef";
  let out = "";
  for (let i = 0; i < bytes; i++) out += chars[Math.floor(Math.random() * 16)];
  return out;
}

function parseStackFrames(stack: string): Array<Record<string, unknown>> {
  const lines = String(stack).split("\n").slice(1, 21);
  return lines
    .map((line) => {
      const match = line.match(/at\s+(.+?)\s+\((.+?):(\d+):(\d+)\)/) || line.match(/at\s+(.+?):(\d+):(\d+)/);
      if (!match) return null;
      if (match.length === 5) {
        return {
          function: match[1],
          filename: match[2],
          lineno: Number(match[3]),
          colno: Number(match[4]),
          in_app: !match[2].includes("node_modules")
        };
      }
      return {
        filename: match[1],
        lineno: Number(match[2]),
        colno: Number(match[3]),
        in_app: !match[1].includes("node_modules")
      };
    })
    .filter(Boolean) as Array<Record<string, unknown>>;
}
