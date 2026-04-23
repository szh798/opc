import { Body, Controller, HttpCode, Post, Req, UseGuards } from "@nestjs/common";
import { IsOptional, IsString, MaxLength } from "class-validator";
import { CurrentUser } from "./auth/current-user.decorator";
import { OptionalAccessTokenGuard } from "./auth/optional-access-token.guard";
import { ErrorReportService } from "./shared/error-report.service";

class ClientErrorDto {
  @IsString()
  @MaxLength(1024)
  message!: string;

  @IsOptional()
  @IsString()
  @MaxLength(8192)
  stack?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  route?: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  level?: "error" | "warn" | "fatal";

  @IsOptional()
  @IsString()
  @MaxLength(64)
  appVersion?: string;

  @IsOptional()
  context?: Record<string, unknown>;
}

/**
 * Phase B1：前端 app.js onError / onUnhandledRejection 统一上报。
 *   - OptionalAccessTokenGuard：未登录也能上报（anonymous 登录前的崩溃也能抓到）
 *   - ValidationPipe 已全局 whitelist，未知字段会被剥掉
 *   - 限流走全局 rate-limit，防止被刷爆
 */
@Controller("client-errors")
export class ClientErrorController {
  constructor(private readonly errorReport: ErrorReportService) {}

  @UseGuards(OptionalAccessTokenGuard)
  @Post()
  @HttpCode(204)
  async submit(
    @Body() body: ClientErrorDto,
    @CurrentUser() user: Record<string, unknown> | null,
    @Req() request: { id?: string; headers?: Record<string, unknown> }
  ) {
    const userAgent = String((request?.headers?.["user-agent"] as string) || "").slice(0, 512);
    this.errorReport.record({
      source: "client",
      level: body.level || "error",
      userId: user ? String(user.id || "") : null,
      requestId: String(request?.id || ""),
      route: body.route || null,
      message: body.message,
      stack: body.stack || null,
      context: body.context || null,
      userAgent: userAgent || null,
      appVersion: body.appVersion || null
    });
    return;
  }
}
