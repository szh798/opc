import { IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";

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
