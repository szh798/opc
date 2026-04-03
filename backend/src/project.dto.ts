import { IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";

class BaseProjectMutationDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  id?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  phase?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  status?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  statusTone?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  color?: string;
}

export class CreateProjectDto extends BaseProjectMutationDto {}

export class UpdateProjectDto extends BaseProjectMutationDto {}

export class ShareResultDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  resultId?: string;
}

export class ProjectChatDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  message?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  content?: string;
}
