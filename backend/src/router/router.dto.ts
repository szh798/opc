import { Type } from "class-transformer";
import { IsIn, IsObject, IsOptional, IsString, MaxLength, ValidateNested } from "class-validator";

export const ROUTER_INPUT_TYPES = ["text", "quick_reply", "agent_switch", "system_event"] as const;
export type RouterInputType = (typeof ROUTER_INPUT_TYPES)[number];

export class CreateRouterSessionDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  sessionId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  source?: string;
}

export class StartRouterStreamInputDto {
  @IsIn(ROUTER_INPUT_TYPES)
  inputType!: RouterInputType;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  text?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  quickReplyId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  routeAction?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  agentKey?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class StartRouterStreamDto {
  @ValidateNested()
  @Type(() => StartRouterStreamInputDto)
  input!: StartRouterStreamInputDto;
}

export class RouterQuickReplyDto {
  @IsString()
  @MaxLength(128)
  quickReplyId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  routeAction?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class RouterAgentSwitchDto {
  @IsString()
  @MaxLength(32)
  agentKey!: string;
}
