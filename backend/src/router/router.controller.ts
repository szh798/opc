import { Body, Controller, Get, Param, Post, Query, Res, UseGuards } from "@nestjs/common";
import type { FastifyReply } from "fastify";
import { AccessTokenGuard } from "../auth/access-token.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import {
  CreateRouterSessionDto,
  RouterAgentSwitchDto,
  StartRouterMessageStreamDto,
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

  @Get("sessions/:id/asset-report/status")
  getAssetReportStatus(@Param("id") sessionId: string, @CurrentUser() user?: Record<string, unknown>) {
    return this.routerService.getAssetReportStatus(sessionId, user);
  }

  @Post("sessions/:id/stream/start")
  startStream(
    @Param("id") sessionId: string,
    @Body() payload: StartRouterStreamDto,
    @CurrentUser() user?: Record<string, unknown>
  ) {
    return this.routerService.startStream(sessionId, payload.input, user);
  }

  @Post("sessions/:id/messages/stream")
  streamMessage(
    @Param("id") sessionId: string,
    @Body() payload: StartRouterMessageStreamDto,
    @CurrentUser() user: Record<string, unknown> | undefined,
    @Res() reply: FastifyReply
  ) {
    return this.routerService.startMessageSse(sessionId, payload, user, reply);
  }

  @Get("streams/:streamId")
  getStream(@Param("streamId") streamId: string, @CurrentUser() user?: Record<string, unknown>) {
    return this.routerService.getStream(streamId, user);
  }

  @Get("streams/:streamId/events")
  getStreamEvents(
    @Param("streamId") streamId: string,
    @Query("afterSeq") afterSeq = "0",
    @CurrentUser() user?: Record<string, unknown>
  ) {
    return this.routerService.getStreamEvents(streamId, Number(afterSeq) || 0, user);
  }

  @Post("streams/:streamId/cancel")
  cancelStream(@Param("streamId") streamId: string, @CurrentUser() user?: Record<string, unknown>) {
    return this.routerService.cancelStream(streamId, user);
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
