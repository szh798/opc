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
}

export class RefreshTokenDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  refreshToken?: string;
}

export class LogoutDto extends RefreshTokenDto {}
