import { IsArray, IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";

class BaseShareDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  resultTitle?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  quote?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  caption?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  hashtags?: string[];
}

export class GenerateShareImageDto extends BaseShareDto {}

export class BuildShareCaptionDto extends BaseShareDto {}
