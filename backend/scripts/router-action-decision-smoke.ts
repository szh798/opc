import { strict as assert } from "node:assert";
import { resolveActionDecision } from "../src/router/router.constants";
import { ROUTER_SKILLS, resolveSkillByRouteAction } from "../src/router/router.skills";

type DecisionExpectation = {
  routeAction: string;
  agentKey: string;
  mode: string;
  chatflowId: string;
  cardType?: string | null;
};

const EXPECTED_DECISIONS: DecisionExpectation[] = [
  {
    routeAction: "mindset_unblock",
    agentKey: "master",
    mode: "guided",
    chatflowId: "cf_onboarding_fallback",
    cardType: null
  },
  {
    routeAction: "mindset_next_step",
    agentKey: "master",
    mode: "guided",
    chatflowId: "cf_onboarding_fallback",
    cardType: null
  },
  {
    routeAction: "company_tax_followup",
    agentKey: "asset",
    mode: "guided",
    chatflowId: "cf_business_health",
    cardType: "business_health"
  },
  {
    routeAction: "company_profit_followup",
    agentKey: "asset",
    mode: "guided",
    chatflowId: "cf_business_health",
    cardType: "business_health"
  },
  {
    routeAction: "company_payroll_followup",
    agentKey: "asset",
    mode: "guided",
    chatflowId: "cf_business_health",
    cardType: "business_health"
  },
  {
    routeAction: "policy_keep_chatting",
    agentKey: "master",
    mode: "free",
    chatflowId: "cf_info_collection",
    cardType: null
  }
];

function normalize(value: unknown) {
  return typeof value === "undefined" ? null : value;
}

function run() {
  for (const expected of EXPECTED_DECISIONS) {
    const decision = resolveActionDecision(expected.routeAction);
    assert.ok(decision, `${expected.routeAction} should resolve`);
    assert.equal(decision.agentKey, expected.agentKey, `${expected.routeAction} agentKey`);
    assert.equal(String(decision.mode || ""), expected.mode, `${expected.routeAction} mode`);
    assert.equal(String(decision.chatflowId || ""), expected.chatflowId, `${expected.routeAction} chatflowId`);
    assert.equal(
      normalize(decision.cardType),
      normalize(expected.cardType),
      `${expected.routeAction} cardType`
    );
  }

  for (const skill of ROUTER_SKILLS) {
    const resolved = resolveSkillByRouteAction(skill.routeAction);
    assert.ok(resolved, `${skill.routeAction} should resolve as skill`);
    assert.equal(resolved.key, skill.key, `${skill.routeAction} skill key`);
    assert.equal(resolveActionDecision(skill.routeAction), null, `${skill.routeAction} should not be a normal routeAction`);
  }

  console.log("[router-decision] routeAction decision assertions passed");
}

run();
