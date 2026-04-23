import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Injectable,
  Logger
} from "@nestjs/common";
import { ErrorReportService } from "./error-report.service";

@Catch()
@Injectable()
export class GlobalHttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalHttpExceptionFilter.name);

  constructor(private readonly errorReport?: ErrorReportService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<{ status: (code: number) => { send: (body: unknown) => unknown } }>();
    const request = ctx.getRequest<{ id?: string; url?: string; method?: string; headers?: Record<string, unknown> }>();
    const requestId = String(request?.id || request?.headers?.["x-request-id"] || "");
    const isRateLimitError =
      exception instanceof Error &&
      /rate limit exceeded/i.test(String(exception.message || "").trim());

    const status = exception instanceof HttpException
      ? exception.getStatus()
      : (isRateLimitError ? HttpStatus.TOO_MANY_REQUESTS : HttpStatus.INTERNAL_SERVER_ERROR);
    const rawBody = exception instanceof HttpException ? exception.getResponse() : null;

    let message = "Internal server error";
    let code = "internal_error";

    if (typeof rawBody === "string" && rawBody.trim()) {
      message = rawBody.trim();
      code = normalizeCode(message);
    } else if (rawBody && typeof rawBody === "object") {
      const candidate = rawBody as { message?: unknown; code?: unknown };
      if (Array.isArray(candidate.message)) {
        message = candidate.message.map((item) => String(item)).join("; ");
      } else if (typeof candidate.message === "string" && candidate.message.trim()) {
        message = candidate.message.trim();
      }

      if (typeof candidate.code === "string" && candidate.code.trim()) {
        code = candidate.code.trim();
      } else {
        code = normalizeCode(message);
      }
    } else if (exception instanceof Error && exception.message.trim()) {
      message = exception.message.trim();
      code = normalizeCode(message);
    }

    // Phase B2：打印带上 requestId / userId，让 jq 能按 requestId 串起完整链路
    const ctxPayload = JSON.stringify({
      requestId,
      method: request?.method || "HTTP",
      url: request?.url || "",
      status,
      code,
      userId: (request as { user?: { id?: unknown } })?.user?.id ?? null,
      message
    });
    if (status >= 500) {
      this.logger.error(ctxPayload, exception instanceof Error ? exception.stack : undefined);
      // Phase B1：只把 5xx 送到错误上报通道，避免业务 4xx（配额/参数）刷爆告警
      this.errorReport?.record({
        source: "server",
        level: "error",
        userId: (request as { user?: { id?: string } })?.user?.id ?? null,
        requestId,
        route: request?.url ?? null,
        message,
        stack: exception instanceof Error ? exception.stack : null,
        context: { method: request?.method, status, code }
      });
    } else {
      this.logger.warn(ctxPayload);
    }

    response.status(status).send({
      statusCode: status,
      message,
      code,
      requestId
    });
  }
}

function normalizeCode(message: string) {
  return String(message || "error")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "error";
}
