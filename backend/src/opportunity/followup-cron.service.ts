import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { OpportunityService } from "./opportunity.service";

@Injectable()
export class FollowupCronService {
  private readonly logger = new Logger(FollowupCronService.name);

  constructor(private readonly opportunityService: OpportunityService) {}

  @Cron("5 * * * *", { name: "project-followup-hourly" })
  async handleHourlyFollowup() {
    const result = await this.opportunityService.advanceDueFollowupCycles().catch((error) => {
      this.logger.warn(`project-followup-hourly failed: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    });
    if (result && result.advanced > 0) {
      this.logger.log(`project-followup-hourly advanced=${result.advanced}`);
    }
  }
}
