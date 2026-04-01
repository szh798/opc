import { IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";

class BaseChatRequestDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  conversationId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  sceneKey?: string;
}

export class SendChatMessageDto extends BaseChatRequestDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  userMessageId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  message?: string;
}

export class StartChatStreamDto extends BaseChatRequestDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  userText?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  message?: string;
}
