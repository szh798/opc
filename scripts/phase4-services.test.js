const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  createConversationState,
  bindStateFromRouterSession,
  buildQuickReplyPayload
} = require("../services/conversation-state.service");
const { cardsToMessages } = require("../services/card-registry.service");
const { foldRouterStreamEvents } = require("../services/router.service");

function readRouteActionSnapshot() {
  const snapshotPath = path.join(__dirname, "..", "tests", "contracts", "route-actions.frontend.snapshot.json");
  return JSON.parse(fs.readFileSync(snapshotPath, "utf8"));
}

async function assertBootstrapFallbackOnUnauthorized() {
  const requestModulePath = require.resolve("../services/request");
  const bootstrapServiceModulePath = require.resolve("../services/bootstrap.service");
  const originalRequestModule = require.cache[requestModulePath];
  const originalBootstrapModule = require.cache[bootstrapServiceModulePath];
  try {
    delete require.cache[requestModulePath];
    require.cache[requestModulePath] = {
      id: requestModulePath,
      filename: requestModulePath,
      loaded: true,
      exports: {
        get: async () => ({
          ok: false,
          statusCode: 401,
          data: {
            code: 401,
            message: "Unauthorized"
          }
        }),
        getRequestConfig: () => ({
          env: "production"
        })
      }
    };

    delete require.cache[bootstrapServiceModulePath];
    const { fetchBootstrap } = require("../services/bootstrap.service");
    const fallback = await fetchBootstrap();

    assert.equal(Boolean(fallback && fallback.user && fallback.user.loggedIn), false);
    assert.equal(Array.isArray(fallback && fallback.projects), true);
    assert.equal(Array.isArray(fallback && fallback.recentChats), true);
  } finally {
    delete require.cache[requestModulePath];
    delete require.cache[bootstrapServiceModulePath];
    if (originalRequestModule) {
      require.cache[requestModulePath] = originalRequestModule;
    }
    if (originalBootstrapModule) {
      require.cache[bootstrapServiceModulePath] = originalBootstrapModule;
    }
  }
}

async function run() {
  const state = createConversationState();
  assert.equal(state.currentAgentId, "master");
  assert.equal(state.routeMode, "guided");

  const bound = bindStateFromRouterSession(state, {
    agentKey: "execution",
    routeMode: "free",
    chatflowId: "cf_execution_growth",
    conversationStateId: "session-123"
  });
  assert.equal(bound.currentAgentId, "execution");
  assert.equal(bound.routeMode, "free");
  assert.equal(bound.activeChatflowId, "cf_execution_growth");
  assert.equal(bound.conversationStateId, "session-123");

  const quickReplyPayload = buildQuickReplyPayload({
    quickReplyId: "qr-001",
    routeAction: "route_explore",
    label: "Start explore"
  });
  assert.equal(quickReplyPayload.quickReplyId, "qr-001");
  assert.equal(quickReplyPayload.routeAction, "route_explore");
  assert.equal(quickReplyPayload.metadata.quickReplyLabel, "Start explore");
  assert.equal(quickReplyPayload.metadata.source, "mini_program_quick_reply");

  const quickReplyPayloadFromAction = buildQuickReplyPayload({
    action: "policy_keep_chatting",
    label: "Keep chatting"
  });
  assert.equal(quickReplyPayloadFromAction.routeAction, "policy_keep_chatting");

  const cardMessages = cardsToMessages([
    {
      cardType: "action_plan_48h",
      title: "48h Action Plan",
      description: "Do these 3 steps",
      primaryText: "Open plan"
    }
  ]);
  assert.equal(cardMessages.length, 1);
  assert.equal(cardMessages[0].type, "artifact_card");
  assert.equal(cardMessages[0].cardType, "action_plan_48h");
  assert.ok(cardMessages[0].title);

  const fallbackCards = cardsToMessages([
    null,
    {
      cardType: "unknown_contract_card"
    },
    {
      cardType: "policy_opportunity",
      title: "Policy Opportunity"
    }
  ]);
  assert.equal(fallbackCards.length, 2);
  assert.equal(fallbackCards[0].type, "artifact_card");
  assert.equal(fallbackCards[0].cardType, "unknown_contract_card");
  assert.ok(fallbackCards[0].title);
  assert.equal(fallbackCards[1].type, "policy_opportunity_card");
  assert.equal(fallbackCards[1].cardType, "policy_opportunity");

  const folded = foldRouterStreamEvents([
    { type: "meta", streamId: "s1" },
    { type: "token", token: "A" },
    { type: "token", token: "B" },
    { type: "card", card: { cardType: "asset_radar" } },
    { type: "done", usage: { completionTokens: 2 } }
  ]);
  assert.equal(folded.content, "AB");
  assert.equal(folded.cards.length, 1);
  assert.equal(folded.done, true);
  assert.equal(folded.usage.completionTokens, 2);

  const foldedError = foldRouterStreamEvents([
    { type: "token", token: "partial" },
    { type: "error", message: "backend_failed" }
  ]);
  assert.equal(foldedError.content, "partial");
  assert.equal(foldedError.done, true);
  assert.equal(foldedError.error, "backend_failed");

  const foldedErrorAndDone = foldRouterStreamEvents([
    { type: "meta", streamId: "s2" },
    { type: "token", token: "A" },
    { type: "error", message: "business_error" },
    { type: "done", status: "error" },
    { type: "done", status: "error" }
  ]);
  assert.equal(foldedErrorAndDone.done, true);
  assert.equal(foldedErrorAndDone.error, "business_error");

  const snapshot = readRouteActionSnapshot();
  assert.ok(Array.isArray(snapshot.actions));
  const conversationSource = fs.readFileSync(path.join(__dirname, "..", "pages", "conversation", "conversation.js"), "utf8");
  for (const item of snapshot.actions) {
    assert.ok(item.routeAction, "snapshot routeAction should exist");
    if (item.frontendReferenceRequired === false) {
      continue;
    }
    assert.ok(
      conversationSource.includes(item.routeAction),
      `frontend conversation source should reference routeAction ${item.routeAction}`
    );
  }

  await assertBootstrapFallbackOnUnauthorized();

  // eslint-disable-next-line no-console
  console.log("PASS phase4 services tests");
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exitCode = 1;
});
