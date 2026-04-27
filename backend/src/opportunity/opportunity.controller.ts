import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { AccessTokenGuard } from "../auth/access-token.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { OpportunityService } from "./opportunity.service";

@Controller("opportunity")
@UseGuards(AccessTokenGuard)
export class OpportunityController {
  constructor(private readonly opportunityService: OpportunityService) {}

  @Post("directions/refresh")
  refreshDirections(
    @CurrentUser() user: Record<string, unknown>,
    @Body() payload: Record<string, unknown>
  ) {
    return this.opportunityService.refreshBusinessDirections({
      userId: String(user.id || ""),
      projectId: typeof payload.projectId === "string" ? payload.projectId : undefined,
      workspaceVersion: Number(payload.workspaceVersion || 0)
    });
  }

  @Post("directions/select")
  selectDirection(
    @CurrentUser() user: Record<string, unknown>,
    @Body() payload: Record<string, unknown>
  ) {
    return this.opportunityService.selectBusinessDirection({
      userId: String(user.id || ""),
      projectId: String(payload.projectId || ""),
      candidateSetId: String(payload.candidateSetId || ""),
      directionId: String(payload.directionId || ""),
      workspaceVersion: Number(payload.workspaceVersion || 0),
      selectionReason: String(payload.selectionReason || "")
    });
  }
}
