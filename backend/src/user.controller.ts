import { Body, Controller, Get, Patch, UseGuards } from "@nestjs/common";
import { AccessTokenGuard } from "./auth/access-token.guard";
import { CurrentUser } from "./auth/current-user.decorator";
import { BootstrapService } from "./bootstrap.service";
import { UpdateUserProfileDto } from "./user.dto";
import { UserService } from "./user.service";

@Controller()
@UseGuards(AccessTokenGuard)
export class UserController {
  constructor(
    private readonly userService: UserService,
    private readonly bootstrapService: BootstrapService
  ) {}

  @Get("user")
  getCurrentUser(@CurrentUser() user: Record<string, unknown>) {
    return this.userService.getCurrentUser(String(user.id || ""));
  }

  @Patch("user/profile")
  updateCurrentUser(@CurrentUser() user: Record<string, unknown>, @Body() payload: UpdateUserProfileDto) {
    return this.userService.updateCurrentUser(String(user.id || ""), { ...payload });
  }

  @Get("user/sidebar")
  getUserSidebar(@CurrentUser() user: Record<string, unknown>) {
    return this.bootstrapService.getSidebar(String(user.id || ""));
  }
}
