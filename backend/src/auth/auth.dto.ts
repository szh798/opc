import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";

export class WechatLoginDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  code?: string;

  @IsOptional()
  @IsBoolean()
  simulateFreshUser?: boolean;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(16384)
  encryptedData?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  iv?: string;

  // 前端 login-card 在 tap 同步上下文里通过 wx.getUserProfile 拿到的用户信息,
  // 直接把解析出的昵称/头像传过来,避免后端对已废弃微信 API 的依赖,
  // 也让 "模拟新用户登录" 在没有真微信链路时也能拿到一个显式昵称。
  @IsOptional()
  @IsString()
  @MaxLength(120)
  nickname?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  avatarUrl?: string;
}

export class RefreshTokenDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  refreshToken?: string;
}

export class LogoutDto extends RefreshTokenDto {}

export class DevFreshLoginDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  nickname?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  avatarUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  devLoginSecret?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  preset?: string;
}
