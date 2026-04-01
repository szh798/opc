import { Controller, Get } from "@nestjs/common";
import { InMemoryDataService } from "./shared/in-memory-data.service";

@Controller()
export class ReportController {
  constructor(private readonly store: InMemoryDataService) {}

  @Get("reports/weekly")
  getWeeklyReport() {
    return this.store.getWeeklyReport();
  }

  @Get("reports/monthly")
  getMonthlyReport() {
    return this.store.getMonthlyReport();
  }

  @Get("reports/social-proof")
  getSocialProof() {
    return this.store.getSocialProof();
  }

  @Get("milestone/current")
  getCurrentMilestone() {
    return this.store.getCurrentMilestone();
  }

  @Get("tree/milestones")
  getTreeMilestones() {
    return this.store.getTreeMilestones();
  }
}
