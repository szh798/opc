import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import { AccessTokenGuard } from "./auth/access-token.guard";
import { CurrentUser } from "./auth/current-user.decorator";
import { GrowthService } from "./growth.service";

@Controller()
@UseGuards(AccessTokenGuard)
export class GrowthController {
  constructor(private readonly growthService: GrowthService) {}

  @Get("growth/tree")
  getGrowthTree(@CurrentUser() user: Record<string, unknown>) {
    return this.growthService.getGrowthTree(String(user.id || ""));
  }

  @Get("growth/milestones/current")
  getCurrentGrowthMilestone(@CurrentUser() user: Record<string, unknown>) {
    return this.growthService.getCurrentGrowthMilestone(String(user.id || ""));
  }

  @Get("growth/milestones/:milestoneId")
  getGrowthMilestoneById(@CurrentUser() user: Record<string, unknown>, @Param("milestoneId") milestoneId: string) {
    return this.growthService.getGrowthMilestoneById(String(user.id || ""), milestoneId);
  }
}
