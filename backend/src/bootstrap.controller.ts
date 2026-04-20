import { Controller, Get, HttpCode, HttpException, HttpStatus, UseGuards } from "@nestjs/common";
import axios from "axios";
import { AccessTokenGuard } from "./auth/access-token.guard";
import { CurrentUser } from "./auth/current-user.decorator";
import { BootstrapService } from "./bootstrap.service";
import { ProfileService } from "./profile.service";
import { getAppConfig } from "./shared/app-config";
import { PrismaService } from "./shared/prisma.service";

@Controller()
export class BootstrapController {
  private readonly config = getAppConfig();

  constructor(
    private readonly bootstrapService: BootstrapService,
    private readonly profileService: ProfileService,
    private readonly prisma: PrismaService
  ) {}

  @Get()
  getRoot() {
    return {
      name: "opc-backend",
      status: "ok",
      message: "Backend is running",
      docsHint: "Use /bootstrap or other API routes for mini-program data"
    };
  }

  @Get("health")
  getHealth() {
    return {
      ok: true,
      service: "opc-backend",
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Phase B4：深度 readiness 探针。
   *   - db_ping：Postgres SELECT 1
   *   - db_write：往 HealthProbe 计数表里 upsert 一次，确保"连上 != 能写"
   *   - dify_reachable：HEAD/GET DIFY_API_BASE_URL 根路径（短超时，失败只降级不熔断）
   * 任一 critical 检查失败返 503，让 LB / 发布脚本能拒绝切流。
   */
  @Get("ready")
  async getReady() {
    const startedAt = Date.now();
    const checks: Record<string, { ok: boolean; latencyMs: number; error?: string }> = {};

    checks.db_ping = await runCheck(async () => {
      await this.prisma.$queryRawUnsafe("SELECT 1");
    });

    checks.db_write = await runCheck(async () => {
      // 用一张不承载业务语义的计数表做写入探针；更新语义就是"我探了一下"
      await this.prisma.$executeRawUnsafe(
        `INSERT INTO "HealthProbe" (id, "probedAt", "probeCount")
         VALUES ('ready', NOW(), 1)
         ON CONFLICT (id) DO UPDATE SET "probedAt" = NOW(), "probeCount" = "HealthProbe"."probeCount" + 1`
      );
    });

    checks.dify_reachable = await runCheck(async () => {
      const url = this.config.difyApiBaseUrl.replace(/\/+$/, "");
      // Dify /v1 根路径未授权时也会快速返回 4xx/5xx；我们只关心"网络可达"
      await axios.get(url, { timeout: 1500, validateStatus: () => true });
    });

    const criticalOk = checks.db_ping.ok && checks.db_write.ok;
    const body = {
      ok: criticalOk,
      service: "opc-backend",
      ready: criticalOk,
      checks,
      totalLatencyMs: Date.now() - startedAt,
      timestamp: new Date().toISOString()
    };

    if (!criticalOk) {
      throw new HttpException(body, HttpStatus.SERVICE_UNAVAILABLE);
    }
    return body;
  }

  @Get("favicon.ico")
  @HttpCode(204)
  getFavicon() {
    return;
  }

  // P0：登录态接口统一走 AccessTokenGuard，匿名/无效 token 直接 401。
  // 历史上这里用的是 OptionalAccessTokenGuard（+ 仅 release 生效的 ReleaseBootstrapAccessGuard），
  // 导致 dev/trial 环境匿名访问会落到 demo 用户数据。
  @UseGuards(AccessTokenGuard)
  @Get("bootstrap")
  getBootstrap(@CurrentUser() user: { id: string }) {
    return this.bootstrapService.getBootstrap(user.id);
  }

  @UseGuards(AccessTokenGuard)
  @Get("sidebar")
  getSidebar(@CurrentUser() user: { id: string }) {
    return this.bootstrapService.getSidebar(user.id);
  }

  @UseGuards(AccessTokenGuard)
  @Get("profile")
  getProfile(@CurrentUser() user: { id: string }) {
    return this.profileService.getProfile(user.id);
  }

  @UseGuards(AccessTokenGuard)
  @Get("asset-inventory")
  getAssetInventory(@CurrentUser() user: { id: string }) {
    return this.profileService.getAssetInventory(user.id);
  }
}

async function runCheck(probe: () => Promise<void>): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const startedAt = Date.now();
  try {
    await probe();
    return { ok: true, latencyMs: Date.now() - startedAt };
  } catch (error) {
    return {
      ok: false,
      latencyMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error || "probe_failed")
    };
  }
}
