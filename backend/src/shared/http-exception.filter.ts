import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger
} from "@nestjs/common";

@Catch()
export class GlobalHttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalHttpExceptionFilter.name);

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

    if (status >= 500) {
      this.logger.error(`${request?.method || "HTTP"} ${request?.url || ""} failed`, exception instanceof Error ? exception.stack : undefined);
    } else {
      this.logger.warn(`${request?.method || "HTTP"} ${request?.url || ""} -> ${status} ${message}`);
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
