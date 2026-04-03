import { Controller, Get, HttpCode, UseGuards } from "@nestjs/common";
import { CurrentUser } from "./auth/current-user.decorator";
import { OptionalAccessTokenGuard } from "./auth/optional-access-token.guard";
import { BootstrapService } from "./bootstrap.service";
import { ProfileService } from "./profile.service";
import { PrismaService } from "./shared/prisma.service";

@Controller()
export class BootstrapController {
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

  @Get("ready")
  async getReady() {
    await this.prisma.$queryRawUnsafe("SELECT 1");

    return {
      ok: true,
      service: "opc-backend",
      ready: true,
      timestamp: new Date().toISOString()
    };
  }

  @Get("favicon.ico")
  @HttpCode(204)
  getFavicon() {
    return;
  }

  @UseGuards(OptionalAccessTokenGuard)
  @Get("bootstrap")
  getBootstrap(@CurrentUser() user?: Record<string, unknown> | null) {
    return this.bootstrapService.getBootstrap(String((user && user.id) || ""));
  }

  @UseGuards(OptionalAccessTokenGuard)
  @Get("sidebar")
  getSidebar(@CurrentUser() user?: Record<string, unknown> | null) {
    return this.bootstrapService.getSidebar(String((user && user.id) || ""));
  }

  @UseGuards(OptionalAccessTokenGuard)
  @Get("profile")
  getProfile(@CurrentUser() user?: Record<string, unknown> | null) {
    return this.profileService.getProfile(String((user && user.id) || ""));
  }
}
