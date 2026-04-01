import { Controller, Get, HttpCode } from "@nestjs/common";
import { InMemoryDataService } from "./shared/in-memory-data.service";

@Controller()
export class BootstrapController {
  constructor(private readonly store: InMemoryDataService) {}

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

  @Get("favicon.ico")
  @HttpCode(204)
  getFavicon() {
    return;
  }

  @Get("bootstrap")
  getBootstrap() {
    return this.store.getBootstrapPayload();
  }

  @Get("sidebar")
  getSidebar() {
    return this.store.getSidebarPayload();
  }

  @Get("profile")
  getProfile() {
    return this.store.getProfile();
  }
}
