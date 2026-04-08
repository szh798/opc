const assert = require("node:assert/strict");

const {
  createConversationState,
  bindStateFromRouterSession,
  buildQuickReplyPayload
} = require("../services/conversation-state.service");
const { cardsToMessages } = require("../services/card-registry.service");
const { foldRouterStreamEvents } = require("../services/router.service");

function run() {
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

  // eslint-disable-next-line no-console
  console.log("PASS phase4 services tests");
}

run();
