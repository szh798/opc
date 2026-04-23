import { Body, Controller, Get, Param, Patch, Post, Res, UseGuards } from "@nestjs/common";
import { FastifyReply } from "fastify";
import { AccessTokenGuard } from "./auth/access-token.guard";
import { CurrentUser } from "./auth/current-user.decorator";
import { BootstrapService } from "./bootstrap.service";
import { UpdateUserProfileDto, UploadUserAvatarDto } from "./user.dto";
import { UserService } from "./user.service";

@Controller()
export class UserController {
  constructor(
    private readonly userService: UserService,
    private readonly bootstrapService: BootstrapService
  ) {}

  @UseGuards(AccessTokenGuard)
  @Get("user")
  getCurrentUser(@CurrentUser() user: Record<string, unknown>) {
    return this.userService.getCurrentUser(String(user.id || ""));
  }

  @UseGuards(AccessTokenGuard)
  @Patch("user/profile")
  updateCurrentUser(@CurrentUser() user: Record<string, unknown>, @Body() payload: UpdateUserProfileDto) {
    return this.userService.updateCurrentUser(String(user.id || ""), { ...payload });
  }

  @UseGuards(AccessTokenGuard)
  @Post("user/avatar")
  uploadCurrentUserAvatar(@CurrentUser() user: Record<string, unknown>, @Body() payload: UploadUserAvatarDto) {
    return this.userService.uploadCurrentUserAvatar(String(user.id || ""), payload.avatarDataUrl);
  }

  @Get("user/avatars/:avatarName")
  async getAvatar(@Param("avatarName") avatarName: string, @Res() reply: FastifyReply) {
    const avatar = await this.userService.getAvatar(avatarName);
    reply.type(avatar.mimeType);
    return reply.send(avatar.buffer);
  }

  @UseGuards(AccessTokenGuard)
  @Get("user/sidebar")
  getUserSidebar(@CurrentUser() user: Record<string, unknown>) {
    return this.bootstrapService.getSidebar(String(user.id || ""));
  }
}
