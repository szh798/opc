import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { AccessTokenGuard } from "./access-token.guard";
import { AuthService } from "./auth.service";
import { DevFreshLoginDto, LogoutDto, RefreshTokenDto, WechatLoginDto } from "./auth.dto";
import { AuthorizationHeader, CurrentUser } from "./current-user.decorator";
import { OptionalAccessTokenGuard } from "./optional-access-token.guard";

@Controller()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("auth/wechat-login")
  loginByWechat(@Body() payload: WechatLoginDto) {
    return this.authService.loginByWechat(payload);
  }

  @Post("auth/dev-fresh-login")
  loginDevFresh(@Body() payload: DevFreshLoginDto) {
    return this.authService.loginByDevFresh(payload);
  }

  @Post("auth/refresh")
  refreshToken(@Body() payload: RefreshTokenDto) {
    return this.authService.refreshAccessToken(payload.refreshToken);
  }

  @UseGuards(AccessTokenGuard)
  @Get("auth/me")
  getAuthUser(@CurrentUser() user: Record<string, unknown>) {
    return user;
  }

  @UseGuards(OptionalAccessTokenGuard)
  @Post("auth/logout")
  logout(@Body() payload: LogoutDto, @AuthorizationHeader() authorization?: string) {
    return this.authService.logout(payload.refreshToken, authorization);
  }
}
