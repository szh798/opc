import type { FastifyReply } from "fastify";

export type SsePayload = Record<string, unknown>;

export function setupSseReply(reply: FastifyReply) {
  reply.header("Content-Type", "text/event-stream; charset=utf-8");
  reply.header("Cache-Control", "no-cache, no-transform");
  reply.header("Connection", "keep-alive");
  reply.header("X-Accel-Buffering", "no");
  reply.header("Content-Encoding", "identity");
  reply.raw.flushHeaders?.();
}

export function writeSse(reply: FastifyReply, eventName: string, payload: SsePayload, id?: string) {
  const lines = [];
  if (id) {
    lines.push(`id: ${id}`);
  }
  lines.push(`event: ${eventName}`);
  lines.push(`data: ${JSON.stringify(payload)}`);
  reply.raw.write(`${lines.join("\n")}\n\n`);
}

export function startSseHeartbeat(reply: FastifyReply, isClosed: () => boolean) {
  return setInterval(() => {
    if (isClosed()) {
      return;
    }
    try {
      reply.raw.write(`event: ping\ndata: {"ok":true}\n\n`);
    } catch (_error) {
      // The close handler owns lifecycle state.
    }
  }, 15000);
}
