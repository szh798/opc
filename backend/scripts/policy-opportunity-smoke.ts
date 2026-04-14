process.env.DATABASE_URL ||= "postgresql://opc:opc@127.0.0.1:5432/opc?schema=public";
process.env.POLICY_SEARCH_ENABLED = "false";
process.env.POLICY_SEARCH_PROVIDER = "mock";

import { PolicyOpportunityService } from "../src/policy/policy-opportunity.service";
import type { PolicyMatchState } from "../src/policy/policy.types";

function assertOk(name: string, condition: unknown, detail = "") {
  const ok = !!condition;
  // eslint-disable-next-line no-console
  console.log(`[${ok ? "PASS" : "FAIL"}] ${name}${detail ? ` - ${detail}` : ""}`);
  if (!ok) {
    throw new Error(`${name} failed${detail ? `: ${detail}` : ""}`);
  }
}

async function run() {
  const service = new PolicyOpportunityService();
  let policyMatch: PolicyMatchState | null = null;

  const first = await service.handlePolicyTurn({
    parkingLot: {},
    input: {
      inputType: "text",
      text: "我还没注册公司，想看看杭州能不能薅羊毛"
    },
    userId: "smoke-user",
    routeReason: "policy_intent"
  });
  policyMatch = first.policyMatch || null;
  assertOk("parse only current slot: company status", policyMatch?.collectedSlots.companyStatus === "unregistered");
  assertOk("does not parse region in same turn", policyMatch?.collectedSlots.region === null);
  assertOk("next step asks region", policyMatch?.step === "ask_region");

  const second = await service.handlePolicyTurn({
    parkingLot: { policyMatch },
    input: {
      inputType: "text",
      text: "杭州"
    },
    userId: "smoke-user",
    routeReason: "policy_slot_collect"
  });
  policyMatch = second.policyMatch || null;
  assertOk("region collected", policyMatch?.collectedSlots.region?.city === "杭州");
  assertOk("next step asks industry", policyMatch?.step === "ask_industry");

  for (const text of ["AI工具", "刚开始", "没有收入"]) {
    const result = await service.handlePolicyTurn({
      parkingLot: { policyMatch },
      input: {
        inputType: "text",
        text
      },
      userId: "smoke-user",
      routeReason: "policy_slot_collect"
    });
    policyMatch = result.policyMatch || null;
    if (result.card) {
      assertOk("policy card generated", result.card.cardType.startsWith("policy_opportunity"));
      assertOk("policy card has items or fallback", !!result.card.payload);
    }
  }

  assertOk("policy flow completed", policyMatch?.step === "completed");
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exitCode = 1;
});
