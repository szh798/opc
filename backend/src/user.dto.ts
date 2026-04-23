import { IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from "class-validator";

export class UpdateUserProfileDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  nickname?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(8)
  initial?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(2048)
  avatarUrl?: string;
}

export class UploadUserAvatarDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(8_000_000)
  @Matches(/^data:image\/(?:png|jpeg|jpg|webp);base64,/i, {
    message: "avatarDataUrl must be a base64-encoded image data URL"
  })
  avatarDataUrl!: string;
}
