import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { AccessTokenGuard } from "../auth/access-token.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import {
  CreateRouterSessionDto,
  RouterAgentSwitchDto,
  RouterQuickReplyDto,
  StartRouterStreamDto
} from "./router.dto";
import { RouterService } from "./router.service";

@Controller("router")
@UseGuards(AccessTokenGuard)
export class RouterController {
  constructor(private readonly routerService: RouterService) {}

  @Post("sessions")
  createOrResumeSession(@Body() payload: CreateRouterSessionDto, @CurrentUser() user?: Record<string, unknown>) {
    return this.routerService.createOrResumeSession(payload, user);
  }

  @Get("sessions/:id")
  getSession(@Param("id") sessionId: string, @CurrentUser() user?: Record<string, unknown>) {
    return this.routerService.getSession(sessionId, user);
  }

  @Post("sessions/:id/stream/start")
  startStream(
    @Param("id") sessionId: string,
    @Body() payload: StartRouterStreamDto,
    @CurrentUser() user?: Record<string, unknown>
  ) {
    return this.routerService.startStream(sessionId, payload.input, user);
  }

  @Get("streams/:streamId")
  getStream(@Param("streamId") streamId: string, @CurrentUser() user?: Record<string, unknown>) {
    return this.routerService.getStream(streamId, user);
  }

  @Post("sessions/:id/agent-switch")
  switchAgent(
    @Param("id") sessionId: string,
    @Body() payload: RouterAgentSwitchDto,
    @CurrentUser() user?: Record<string, unknown>
  ) {
    return this.routerService.switchAgent(sessionId, payload, user);
  }

  @Post("sessions/:id/quick-reply")
  quickReply(
    @Param("id") sessionId: string,
    @Body() payload: RouterQuickReplyDto,
    @CurrentUser() user?: Record<string, unknown>
  ) {
    return this.routerService.quickReply(sessionId, payload, user);
  }

  @Post("sessions/:id/memory/inject-preview")
  previewMemory(@Param("id") sessionId: string, @CurrentUser() user?: Record<string, unknown>) {
    return this.routerService.previewMemoryInjection(sessionId, user);
  }
}
