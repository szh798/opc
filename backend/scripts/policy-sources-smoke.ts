import * as fs from "node:fs";
import * as path from "node:path";
import {
  buildPolicyCandidatesJson,
  choosePrimaryPolicySource,
  normalizePolicySourcesFromRecord,
  validateDifyPolicyReferences
} from "../src/policy/policy-source.constants";
import { normalizeSeedPolicyRecord } from "../src/policy/policy-catalog.service";
import { PolicyOpcRelevanceService } from "../src/policy/policy-opc-relevance.service";

const SEED_PATH = path.join(process.cwd(), "prisma", "seed-data", "opc-policies-2026-05-07.sources.json");

function assertOk(label: string, condition: unknown): asserts condition {
  if (!condition) {
    throw new Error(`Assertion failed: ${label}`);
  }
  console.log(`[ok] ${label}`);
}

function fixturePolicy(index: number) {
  return {
    policy_id: `fixture_policy_${index}`,
    region: index % 2 ? "深圳" : "北京",
    title: `OPC 小微创业政策 ${index}`,
    status: index % 3 === 0 ? "entry_pending" : index % 5 === 0 ? "trial_watch" : "open_apply",
    fine_tags: ["OPC", "小微企业"],
    sources: [
      {
        type: "apply_entry",
        label: "办理入口",
        url: `https://zwfw.gov.cn/policy/${index}?utm_source=test`
      },
      {
        type: "official_original",
        label: "官方原文",
        url: `https://www.gov.cn/zhengce/${index}/`
      },
      {
        type: "pdf",
        label: "PDF指南",
        url: `https://www.gov.cn/files/${index}.pdf`
      }
    ]
  };
}

function loadSeedRecords() {
  if (!fs.existsSync(SEED_PATH)) {
    console.warn(`[warn] seed file not found, skipped real V2 JSON count check: ${SEED_PATH}`);
    return null;
  }
  const raw = JSON.parse(fs.readFileSync(SEED_PATH, "utf8")) as unknown;
  return Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as { policies?: unknown[] }).policies)
      ? (raw as { policies: unknown[] }).policies
      : null;
}

function main() {
  const fixture = Array.from({ length: 25 }, (_, index) => fixturePolicy(index + 1));
  assertOk("fixture has 25 policies", fixture.length === 25);

  for (const [index, record] of fixture.entries()) {
    const normalized = normalizeSeedPolicyRecord(record);
    assertOk(`fixture policy ${index + 1} normalizes`, !!normalized.policy);
    assertOk(`fixture policy ${index + 1} has valid sources`, normalized.sources.length >= 3);
  }

  const duplicate = normalizePolicySourcesFromRecord({
    sources: [
      { type: "pdf", label: "PDF", url: "https://www.gov.cn/a.pdf?utm_campaign=x" },
      { type: "pdf", label: "PDF duplicate", url: "https://www.gov.cn/a.pdf" },
      { type: "bad_type", label: "Bad", url: "https://www.gov.cn/bad" },
      { type: "news", label: "Bad URL", url: "not-a-url" }
    ]
  });
  assertOk("duplicate normalized urls dedupe", duplicate.sources.length === 1);
  assertOk("invalid source type warns", duplicate.warnings.some((warning) => warning.includes("invalid source type")));
  assertOk("invalid source url warns", duplicate.warnings.some((warning) => warning.includes("invalid source url")));

  const openApply = normalizePolicySourcesFromRecord(fixturePolicy(1)).sources;
  assertOk("open_apply + apply_entry uses open entry", choosePrimaryPolicySource("open_apply", openApply).primaryActionText === "打开入口");
  assertOk("entry_pending does not claim apply now", !/立即|申请/.test(choosePrimaryPolicySource("entry_pending", openApply).primaryActionText));
  assertOk("trial_watch does not claim formal policy", !/正式/.test(choosePrimaryPolicySource("trial_watch", openApply).primaryActionText));

  const candidates = buildPolicyCandidatesJson([
    {
      id: "policy_a",
      region: "深圳",
      title: "OPC 开办一类事",
      status: "open_apply",
      fineTags: ["开办"],
      sources: openApply
    }
  ]);
  assertOk("policy_candidates_json contains sources", Array.isArray(candidates[0].sources) && candidates[0].sources.length > 0);
  assertOk("Dify policy_id must exist", !validateDifyPolicyReferences(candidates, { policy_id: "missing" }).ok);
  assertOk("Dify URL must come from sources", !validateDifyPolicyReferences(candidates, {
    policy_id: "policy_a",
    url: "https://example.com/fake"
  }).ok);
  assertOk("Dify candidate URL is accepted", validateDifyPolicyReferences(candidates, {
    policy_id: "policy_a",
    url: openApply[0].url
  }).ok);

  const relevance = new PolicyOpcRelevanceService();
  const unregisteredSlots = {
    companyStatus: "unregistered",
    region: null,
    industry: null,
    age: null,
    stage: null,
    revenue: null
  } as const;
  const shenzhenRelevance = relevance.evaluate({
    title: "深圳 OPC 开办一类事",
    content: "深圳一站式开办和政务服务入口，适合未注册或准备注册用户核验开办流程、指南和官方依据。",
    slots: unregisteredSlots
  });
  assertOk("OPC catalog open_apply is relevant to unregistered user", shenzhenRelevance.opcRelevanceLevel === "high");
  assertOk("OPC catalog open_apply recommends pre-registration stage", shenzhenRelevance.recommendedStage === "pre_registration");

  const haidianRelevance = relevance.evaluate({
    title: "北京海淀 OPC 补贴、模型券和创业生态政策",
    content: "海淀补贴、模型券和创业生态相关政策已发布，申报入口仍需继续核验。",
    slots: unregisteredSlots
  });
  assertOk("OPC entry_pending catalog policy remains a candidate", haidianRelevance.opcRelevanceLevel !== "irrelevant");

  const seedRecords = loadSeedRecords();
  if (seedRecords) {
    assertOk("V2 seed JSON has 25 policies", seedRecords.length === 25);
    for (const [index, record] of seedRecords.entries()) {
      assertOk(`seed policy ${index + 1} is object`, !!record && typeof record === "object" && !Array.isArray(record));
      const normalized = normalizeSeedPolicyRecord(record as Record<string, unknown>);
      assertOk(`seed policy ${index + 1} normalizes`, !!normalized.policy);
      assertOk(`seed policy ${index + 1} has source`, normalized.sources.length > 0);
    }
  }
}

main();
