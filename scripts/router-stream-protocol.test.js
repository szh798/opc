const assert = require("node:assert/strict");
const { foldRouterStreamEvents } = require("../services/router.service");

function runSuccessFlowContract() {
  const folded = foldRouterStreamEvents([
    { type: "meta", streamId: "s-success" },
    { type: "token", token: "H" },
    { type: "token", token: "i" },
    { type: "done", status: "success", usage: { completionTokens: 2 } }
  ]);

  assert.equal(folded.done, true, "success flow should terminate");
  assert.equal(folded.error, "", "success flow should not carry error");
  assert.equal(folded.content, "Hi", "success flow should fold token payload");
  assert.equal(folded.usage.completionTokens, 2, "success flow should keep usage");
}

function runErrorFlowContract() {
  const folded = foldRouterStreamEvents([
    { type: "meta", streamId: "s-error" },
    { type: "token", token: "partial" },
    { type: "error", message: "upstream_failed" },
    { type: "done", status: "error", usage: { completionTokens: 0 } }
  ]);

  assert.equal(folded.done, true, "error flow should terminate");
  assert.equal(folded.error, "upstream_failed", "error flow should preserve reason");
  assert.equal(folded.content, "partial", "error flow should preserve partial token stream");
}

function runDuplicateDoneContract() {
  const folded = foldRouterStreamEvents([
    { type: "meta", streamId: "s-dup" },
    { type: "token", token: "A" },
    { type: "done", status: "success", usage: { completionTokens: 1 } },
    { type: "done", status: "success", usage: { completionTokens: 1 } }
  ]);

  assert.equal(folded.done, true, "duplicate done should still terminate");
  assert.equal(folded.content, "A", "duplicate done should not break folded content");
}

function run() {
  runSuccessFlowContract();
  runErrorFlowContract();
  runDuplicateDoneContract();
  // eslint-disable-next-line no-console
  console.log("PASS router stream protocol tests");
}

run();
