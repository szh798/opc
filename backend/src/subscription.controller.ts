import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { AccessTokenGuard } from "./auth/access-token.guard";
import { CurrentUser } from "./auth/current-user.decorator";
import { PrismaService } from "./shared/prisma.service";

@Controller("subscriptions")
@UseGuards(AccessTokenGuard)
export class SubscriptionController {
  constructor(private readonly prisma: PrismaService) {}

  @Post("project-followup")
  async saveProjectFollowupSubscription(
    @CurrentUser() user: Record<string, unknown>,
    @Body() payload: Record<string, unknown>
  ) {
    const templateId = String(payload.templateId || "").trim();
    if (!templateId) {
      return {
        success: false,
        reason: "missing_template_id"
      };
    }

    const now = new Date();
    const expiresAt = new Date(now);
    expiresAt.setDate(expiresAt.getDate() + 7);

    const token = await this.prisma.subscriptionToken.create({
      data: {
        userId: String(user.id || ""),
        templateId,
        scene: "followup",
        status: "available",
        grantedAt: now,
        expiresAt,
        sendStatus: "pending"
      }
    });

    return {
      success: true,
      tokenId: token.id,
      expiresAt: token.expiresAt ? token.expiresAt.toISOString() : ""
    };
  }
}
