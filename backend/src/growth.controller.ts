import { Controller, Get, Param } from "@nestjs/common";
import { InMemoryDataService } from "./shared/in-memory-data.service";

@Controller()
export class GrowthController {
  constructor(private readonly store: InMemoryDataService) {}

  @Get("growth/tree")
  getGrowthTree() {
    return this.store.getGrowthTree();
  }

  @Get("growth/milestones/current")
  getCurrentGrowthMilestone() {
    return this.store.getCurrentGrowthMilestone();
  }

  @Get("growth/milestones/:milestoneId")
  getGrowthMilestoneById(@Param("milestoneId") milestoneId: string) {
    return this.store.getGrowthMilestoneById(milestoneId);
  }
}
