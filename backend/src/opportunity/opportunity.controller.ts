import { Body, Controller, Post, Res, UseGuards } from "@nestjs/common";
import type { FastifyReply } from "fastify";
import { AccessTokenGuard } from "../auth/access-token.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { setupSseReply, startSseHeartbeat, writeSse } from "../router/router-sse";
import { OpportunityService } from "./opportunity.service";

@Controller("opportunity")
@UseGuards(AccessTokenGuard)
export class OpportunityController {
  constructor(private readonly opportunityService: OpportunityService) {}

  @Post("directions/refresh")
  refreshDirections(
    @CurrentUser() user: Record<string, unknown>,
    @Body() payload: Record<string, unknown>
  ) {
    return this.opportunityService.refreshBusinessDirections({
      userId: String(user.id || ""),
      projectId: typeof payload.projectId === "string" ? payload.projectId : undefined,
      workspaceVersion: Number(payload.workspaceVersion || 0)
    });
  }

  @Post("directions/select")
  selectDirection(
    @CurrentUser() user: Record<string, unknown>,
    @Body() payload: Record<string, unknown>
  ) {
    return this.opportunityService.selectBusinessDirection({
      userId: String(user.id || ""),
      projectId: String(payload.projectId || ""),
      candidateSetId: String(payload.candidateSetId || ""),
      directionId: String(payload.directionId || ""),
      workspaceVersion: Number(payload.workspaceVersion || 0),
      selectionReason: String(payload.selectionReason || "")
    });
  }

  @Post("deep-dive/message")
  sendDeepDiveMessage(
    @CurrentUser() user: Record<string, unknown>,
    @Body() payload: Record<string, unknown>
  ) {
    return this.opportunityService.sendDeepDiveMessage({
      userId: String(user.id || ""),
      projectId: String(payload.projectId || ""),
      message: String(payload.message || payload.content || ""),
      workspaceVersion: Number(payload.workspaceVersion || 0)
    });
  }

  @Post("deep-dive/message/stream")
  async streamDeepDiveMessage(
    @CurrentUser() user: Record<string, unknown>,
    @Body() payload: Record<string, unknown>,
    @Res() reply: FastifyReply
  ) {
    setupSseReply(reply);
    const streamId = `opportunity-deep-dive-${Date.now()}`;
    let seq = 0;
    let closed = false;
    reply.raw.on("close", () => {
      closed = true;
    });
    const heartbeat = startSseHeartbeat(reply, () => closed);
    const emit = (eventName: string, eventPayload: Record<string, unknown>) => {
      if (closed || reply.raw.writableEnded) {
        return;
      }
      seq += 1;
      const body = {
        stream_id: streamId,
        seq,
        event_id: `${streamId}:${seq}`,
        created_at: new Date().toISOString(),
        ...eventPayload
      };
      writeSse(reply, eventName, body, `${streamId}:${seq}`);
    };

    try {
      await this.opportunityService.streamDeepDiveMessage({
        userId: String(user.id || ""),
        projectId: String(payload.projectId || ""),
        message: String(payload.message || payload.content || ""),
        workspaceVersion: Number(payload.workspaceVersion || 0)
      }, emit);
      emit("stream.done", {
        ok: true
      });
    } catch (error) {
      emit("stream.error", {
        code: "opportunity_deep_dive_stream_failed",
        message: error instanceof Error && error.message ? error.message : "Opportunity deep dive stream failed",
        retryable: true
      });
    } finally {
      clearInterval(heartbeat);
      if (!closed && !reply.raw.writableEnded) {
        reply.raw.end();
      }
    }
  }
}
