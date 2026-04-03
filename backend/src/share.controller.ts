import { Body, Controller, Get, Param, Post, Res, UseGuards } from "@nestjs/common";
import { FastifyReply } from "fastify";
import { AccessTokenGuard } from "./auth/access-token.guard";
import { CurrentUser } from "./auth/current-user.decorator";
import { BuildShareCaptionDto, GenerateShareImageDto } from "./share.dto";
import { ShareService } from "./share.service";

@Controller()
export class ShareController {
  constructor(private readonly shareService: ShareService) {}

  @UseGuards(AccessTokenGuard)
  @Get("share/preview")
  getSharePreview(@CurrentUser() user: Record<string, unknown>) {
    return this.shareService.getSharePreview(String(user.id || ""));
  }

  @UseGuards(AccessTokenGuard)
  @Post("share/generate-image")
  generateShareImage(@CurrentUser() user: Record<string, unknown>, @Body() payload: GenerateShareImageDto) {
    return this.shareService.generateShareImage(String(user.id || ""), { ...payload });
  }

  @UseGuards(AccessTokenGuard)
  @Post("share/caption")
  buildShareCaption(@CurrentUser() user: Record<string, unknown>, @Body() payload: BuildShareCaptionDto) {
    return this.shareService.buildShareCaption(String(user.id || ""), { ...payload });
  }

  @Get("share/posters/:posterId")
  async getPoster(@Param("posterId") posterId: string, @Res() reply: FastifyReply) {
    const poster = await this.shareService.getPoster(posterId);
    reply.type(poster.mimeType);
    return reply.send(poster.buffer);
  }
}
