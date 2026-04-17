import { strict as assert } from "node:assert";
import fs from "node:fs";
import path from "node:path";
import {
  getQuickRepliesByAgent,
  resolveActionDecision,
  ROUTER_AGENTS
} from "../src/router/router.constants";

type SnapshotAction = {
  routeAction: string;
  agentKey: string;
  mode?: string | null;
  chatflowId?: string | null;
  cardType?: string | null;
};

type Snapshot = {
  actions: SnapshotAction[];
};

function readSnapshot(): Snapshot {
  const snapshotPath = path.resolve(
    __dirname,
    "..",
    "..",
    "tests",
    "contracts",
    "route-actions.frontend.snapshot.json"
  );
  return JSON.parse(fs.readFileSync(snapshotPath, "utf8")) as Snapshot;
}

function normalize(value: unknown) {
  return typeof value === "undefined" ? null : value;
}

function assertDecisionMatchesSnapshot(action: SnapshotAction) {
  const decision = resolveActionDecision(action.routeAction);
  assert.ok(decision, `routeAction should resolve: ${action.routeAction}`);
  assert.equal(decision.agentKey, action.agentKey, `${action.routeAction} agentKey`);
  assert.equal(normalize(decision.mode), normalize(action.mode), `${action.routeAction} mode`);
  assert.equal(normalize(decision.chatflowId), normalize(action.chatflowId), `${action.routeAction} chatflowId`);
  assert.equal(normalize(decision.cardType), normalize(action.cardType), `${action.routeAction} cardType`);
}

function assertQuickRepliesResolvable() {
  for (const agentKey of ROUTER_AGENTS) {
    const replies = getQuickRepliesByAgent(agentKey);
    assert.ok(Array.isArray(replies), `${agentKey} quick replies should be an array`);
    assert.ok(replies.length > 0, `${agentKey} should expose quick replies`);

    for (const reply of replies) {
      assert.ok(reply.quickReplyId, `${agentKey} quick reply id should exist`);
      assert.ok(reply.label, `${agentKey} quick reply label should exist`);
      assert.ok(reply.routeAction, `${agentKey} quick reply routeAction should exist`);
      assert.ok(
        resolveActionDecision(reply.routeAction),
        `${agentKey} quick reply routeAction should resolve: ${reply.routeAction}`
      );
    }
  }
}

function run() {
  const snapshot = readSnapshot();
  assert.ok(Array.isArray(snapshot.actions), "snapshot actions should be an array");
  assert.ok(snapshot.actions.length > 0, "snapshot should include route actions");

  for (const action of snapshot.actions) {
    assertDecisionMatchesSnapshot(action);
  }
  assertQuickRepliesResolvable();

  console.log("[router-contract] routeAction contract assertions passed");
}

run();
