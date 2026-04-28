import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import { AccessTokenGuard } from "./access-token.guard";
import { AuthService } from "./auth.service";
import {
  DevFreshLoginDto,
  LogoutDto,
  RefreshTokenDto,
  SmsLoginDto,
  SmsSendCodeDto,
  SmsVerifyCodeDto,
  WechatLoginDto,
  WechatPhoneLoginDto
} from "./auth.dto";
import { AuthorizationHeader, CurrentUser } from "./current-user.decorator";
import { OptionalAccessTokenGuard } from "./optional-access-token.guard";
import { SmsVerificationService } from "./sms-verification.service";

@Controller()
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly smsVerificationService: SmsVerificationService
  ) {}

  @Post("auth/wechat-login")
  loginByWechat(@Body() payload: WechatLoginDto) {
    return this.authService.loginByWechat(payload);
  }

  @Post("auth/dev-fresh-login")
  loginDevFresh(@Body() payload: DevFreshLoginDto) {
    return this.authService.loginByDevFresh(payload);
  }

  @Post("auth/sms-login")
  loginBySms(@Body() payload: SmsLoginDto) {
    return this.authService.loginBySms(payload);
  }

  @Post("auth/phone-login")
  loginByWechatPhone(@Body() payload: WechatPhoneLoginDto) {
    return this.authService.loginByWechatPhone(payload);
  }

  @Post("auth/refresh")
  refreshToken(@Body() payload: RefreshTokenDto) {
    return this.authService.refreshAccessToken(payload.refreshToken);
  }

  @Post("auth/sms/send-code")
  sendSmsCode(@Body() payload: SmsSendCodeDto, @Req() request: RequestLike) {
    return this.smsVerificationService.sendCode(payload, readRequestMetadata(request));
  }

  @Post("auth/sms/verify-code")
  verifySmsCode(@Body() payload: SmsVerifyCodeDto) {
    return this.smsVerificationService.verifyCode(payload);
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

type RequestLike = {
  ip?: string;
  headers?: Record<string, string | string[] | undefined>;
};

function readRequestMetadata(request: RequestLike) {
  const forwardedFor = request.headers?.["x-forwarded-for"];
  const userAgent = request.headers?.["user-agent"];
  return {
    requestIp: Array.isArray(forwardedFor)
      ? forwardedFor[0]
      : String(forwardedFor || request.ip || "").split(",")[0].trim(),
    userAgent: Array.isArray(userAgent) ? userAgent[0] : String(userAgent || "")
  };
}
