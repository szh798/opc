import { Controller, Get, UseGuards } from "@nestjs/common";
import { AccessTokenGuard } from "./auth/access-token.guard";
import { CurrentUser } from "./auth/current-user.decorator";
import { GrowthService } from "./growth.service";
import { ReportService } from "./report.service";

@Controller()
@UseGuards(AccessTokenGuard)
export class ReportController {
  constructor(
    private readonly reportService: ReportService,
    private readonly growthService: GrowthService
  ) {}

  @Get("reports/weekly")
  getWeeklyReport(@CurrentUser() user: Record<string, unknown>) {
    return this.reportService.getWeeklyReport(String(user.id || ""));
  }

  @Get("reports/monthly")
  getMonthlyReport(@CurrentUser() user: Record<string, unknown>) {
    return this.reportService.getMonthlyReport(String(user.id || ""));
  }

  @Get("reports/social-proof")
  getSocialProof(@CurrentUser() user: Record<string, unknown>) {
    return this.reportService.getSocialProof(String(user.id || ""));
  }

  @Get("milestone/current")
  getCurrentMilestone(@CurrentUser() user: Record<string, unknown>) {
    return this.reportService.getCurrentMilestone(String(user.id || ""));
  }

  @Get("tree/milestones")
  getTreeMilestones(@CurrentUser() user: Record<string, unknown>) {
    return this.growthService.getGrowthTree(String(user.id || "")).then((result) => result.milestones);
  }
}
