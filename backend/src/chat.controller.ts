import { Body, Controller, Delete, Get, Param, Post, UseGuards } from "@nestjs/common";
import { AccessTokenGuard } from "./auth/access-token.guard";
import { CurrentUser } from "./auth/current-user.decorator";
import { OptionalAccessTokenGuard } from "./auth/optional-access-token.guard";
import { ChatService } from "./chat.service";
import { SendChatMessageDto, StartChatStreamDto } from "./chat.dto";

@Controller()
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @UseGuards(OptionalAccessTokenGuard)
  @Get("chat/scenes/:sceneKey")
  getChatScene(@Param("sceneKey") sceneKey: string, @CurrentUser() user?: Record<string, unknown>) {
    return this.chatService.getScene(sceneKey, user);
  }

  @UseGuards(AccessTokenGuard)
  @Post("chat/messages")
  sendChatMessage(@Body() payload: SendChatMessageDto, @CurrentUser() user?: Record<string, unknown>) {
    return this.chatService.sendMessage(payload, user);
  }

  @UseGuards(AccessTokenGuard)
  @Post("chat/stream/start")
  startChatStream(@Body() payload: StartChatStreamDto, @CurrentUser() user?: Record<string, unknown>) {
    return this.chatService.startStream(payload, user);
  }

  @UseGuards(AccessTokenGuard)
  @Get("chat/stream/:streamId")
  getChatStream(@Param("streamId") streamId: string, @CurrentUser() user?: Record<string, unknown>) {
    return this.chatService.getStream(streamId, user);
  }

  @UseGuards(OptionalAccessTokenGuard)
  @Delete("conversations/:conversationId")
  deleteConversation(@Param("conversationId") conversationId: string, @CurrentUser() user?: Record<string, unknown> | null) {
    return this.chatService.deleteConversation(conversationId, user);
  }

  @UseGuards(OptionalAccessTokenGuard)
  @Delete("conversations")
  clearConversations(@CurrentUser() user?: Record<string, unknown> | null) {
    return this.chatService.clearConversations(user);
  }

  /** @deprecated Use GET /chat/scenes/:sceneKey instead. Will be removed in next release. */
  @UseGuards(OptionalAccessTokenGuard)
  @Get("conversation/home")
  getLegacyHomeConversation() {
    return this.chatService.getLegacyConversation("home");
  }

  /** @deprecated Use GET /chat/scenes/:sceneKey instead. Will be removed in next release. */
  @UseGuards(OptionalAccessTokenGuard)
  @Get("conversation/onboarding")
  getLegacyOnboardingConversation() {
    return this.chatService.getLegacyConversation("onboarding");
  }

  /** @deprecated Use GET /chat/scenes/:sceneKey instead. Will be removed in next release. */
  @UseGuards(OptionalAccessTokenGuard)
  @Get("conversation/ai")
  getLegacyAiConversation() {
    return this.chatService.getLegacyConversation("ai");
  }

  /** @deprecated Use GET /chat/scenes/:sceneKey instead. Will be removed in next release. */
  @UseGuards(OptionalAccessTokenGuard)
  @Get("conversation/ip")
  getLegacyIpConversation() {
    return this.chatService.getLegacyConversation("ip");
  }
}
