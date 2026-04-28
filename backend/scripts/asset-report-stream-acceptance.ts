import * as dotenv from "dotenv";
import { StreamingMarkupFilter } from "../src/router/streaming-markup-filter";
import { setupSseReply, writeSse } from "../src/router/router-sse";
import { PrismaService } from "../src/shared/prisma.service";

dotenv.config();

type FrontendStreamService = {
  createSseParser: () => {
    feed: (text: string) => Array<{ event: string; data: Record<string, unknown> }>;
  };
  createChunkDecoder: () => {
    decode: (chunk: ArrayBuffer | Uint8Array) => string;
    flush: () => string;
  };
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function logPass(message: string) {
  console.log(`PASS ${message}`);
}

function loadFrontendStreamService(): FrontendStreamService {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require("../../services/chat-stream.service.js") as FrontendStreamService;
}

function testSseWireFormat() {
  const headers: Record<string, string> = {};
  const chunks: string[] = [];
  const reply = {
    header(key: string, value: string) {
      headers[key] = value;
      return this;
    },
    raw: {
      flushHeadersCalled: false,
      flushHeaders() {
        this.flushHeadersCalled = true;
      },
      write(chunk: string) {
        chunks.push(chunk);
      }
    }
  } as unknown as Parameters<typeof setupSseReply>[0];

  setupSseReply(reply);
  writeSse(
    reply,
    "card.patch",
    {
      stream_id: "stream-1",
      seq: 2,
      event_id: "stream-1:2",
      created_at: "2026-04-28T00:00:00.000Z",
      card_id: "card-1",
      patch: { progress: 58 }
    },
    "stream-1:2"
  );

  assert(headers["Content-Type"] === "text/event-stream; charset=utf-8", "SSE content type mismatch");
  assert(headers["Cache-Control"] === "no-cache, no-transform", "SSE cache header mismatch");
  assert(headers["X-Accel-Buffering"] === "no", "SSE buffering header missing");
  assert((reply as any).raw.flushHeadersCalled === true, "flushHeaders was not called");
  assert(chunks[0].includes("id: stream-1:2\n"), "SSE id line missing");
  assert(chunks[0].includes("event: card.patch\n"), "SSE event line missing");
  assert(chunks[0].includes('"seq":2'), "SSE payload seq missing");
  logPass("backend SSE helper emits headers, id/event/data, and seq payload");
}

function testStreamingMarkupFilter() {
  const filter = new StreamingMarkupFilter();
  const visible = [
    filter.consume("visible <flow_"),
    filter.consume('complete result="asset_radar" /> text '),
    filter.consume("<card type=\"asset_radar\">"),
    filter.consume('{"x":1}</card> done '),
    filter.consume("<think>secret"),
    filter.consume("</think> end"),
    filter.flush()
  ].join("");

  assert(!visible.includes("<flow_"), "flow_complete tag leaked");
  assert(!visible.includes("<card"), "card tag leaked");
  assert(!visible.includes("<think"), "think tag leaked");
  assert(!visible.includes("secret"), "think content leaked");
  assert(visible.includes("visible") && visible.includes("text") && visible.includes("done") && visible.includes("end"), "visible text was lost");
  logPass("StreamingMarkupFilter suppresses split XML/internal tags");
}

function testFrontendSseParser() {
  const { createSseParser } = loadFrontendStreamService();
  const parser = createSseParser();
  const events = [
    ...parser.feed('id: s:1\nevent: assistant.text.delta\ndata: {"delta":"你'),
    ...parser.feed('好"}\n\nid: s:2\nevent: card.created\ndata: {"card_type":"asset_report_progress","card_id":"c1"}\n\n')
  ];

  assert(events.length === 2, "frontend parser did not handle split/sticky events");
  assert(events[0].event === "assistant.text.delta", "frontend parser event name mismatch");
  assert(events[0].data.delta === "你好", "frontend parser split JSON mismatch");
  assert(events[1].data.card_type === "asset_report_progress", "frontend parser card_type mismatch");
  logPass("frontend SSE parser handles split and sticky events");
}

function testFrontendUtf8Decoder() {
  const { createChunkDecoder, createSseParser } = loadFrontendStreamService();
  const decoder = createChunkDecoder();
  const parser = createSseParser();
  const bytes = Buffer.from('event: assistant.text.delta\ndata: {"delta":"你好"}\n\n', "utf8");
  const splitAt = bytes.indexOf(Buffer.from("好", "utf8")) + 1;
  const text = decoder.decode(bytes.slice(0, splitAt)) + decoder.decode(bytes.slice(splitAt)) + decoder.flush();
  const events = parser.feed(text);

  assert(events.length === 1, "UTF-8 decoded SSE event count mismatch");
  assert(events[0].data.delta === "你好", "UTF-8 split Chinese character decoded incorrectly");
  logPass("frontend UTF-8 decoder handles split Chinese characters");
}

async function testDatabaseSchema() {
  const prisma = new PrismaService();
  try {
    await prisma.$connect();
    const streamColumns = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name::text AS column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'StreamEvent'
        AND column_name IN ('sessionId', 'messageId', 'cardId', 'generationJobId', 'clientMessageId')
    `;
    const streamColumnSet = new Set(streamColumns.map((item) => item.column_name));
    ["sessionId", "messageId", "cardId", "generationJobId", "clientMessageId"].forEach((column) => {
      assert(streamColumnSet.has(column), `StreamEvent column missing: ${column}`);
    });

    const generationJobTables = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name::text AS table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = 'GenerationJob'
    `;
    assert(generationJobTables.length === 1, "GenerationJob table missing");

    const generationJobColumns = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name::text AS column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'GenerationJob'
        AND column_name IN ('chatflowSessionId', 'jobType', 'status', 'progress', 'partialData', 'result', 'streamId')
    `;
    const generationJobColumnSet = new Set(generationJobColumns.map((item) => item.column_name));
    ["chatflowSessionId", "jobType", "status", "progress", "partialData", "result", "streamId"].forEach((column) => {
      assert(generationJobColumnSet.has(column), `GenerationJob column missing: ${column}`);
    });
    logPass("database schema contains StreamEvent recovery fields and GenerationJob");
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  console.log("Asset report stream acceptance started");
  testSseWireFormat();
  testStreamingMarkupFilter();
  testFrontendSseParser();
  testFrontendUtf8Decoder();
  await testDatabaseSchema();
  console.log("Asset report stream acceptance completed");
}

main().catch((error) => {
  console.error(`FAIL ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
