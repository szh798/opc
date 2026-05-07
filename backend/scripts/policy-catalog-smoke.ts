import axios from "axios";

const baseURL = String(process.env.SMOKE_BASE_URL || process.env.PUBLIC_BASE_URL || "http://127.0.0.1:3000").replace(/\/+$/, "");

function assertOk(label: string, condition: unknown, detail = ""): asserts condition {
  if (!condition) {
    throw new Error(`Assertion failed: ${label}${detail ? ` - ${detail}` : ""}`);
  }
  console.log(`[ok] ${label}${detail ? ` - ${detail}` : ""}`);
}

async function get(path: string) {
  return axios.get(`${baseURL}${path}`, {
    timeout: Number(process.env.SMOKE_TIMEOUT_MS || 30000),
    validateStatus: () => true
  });
}

async function main() {
  const list = await get("/policies");
  assertOk("GET /policies returns 2xx", list.status >= 200 && list.status < 300, String(list.status));
  assertOk("GET /policies has ok=true", list.data?.ok === true);
  assertOk("GET /policies returns policies array", Array.isArray(list.data?.policies));

  const policies = list.data.policies as Array<Record<string, unknown>>;
  if (!policies.length) {
    console.warn("[warn] no policy catalog rows found; run npm run db:seed:policies after adding V2 JSON");
    return;
  }

  const first = policies[0];
  assertOk("policy exposes sources[]", Array.isArray(first.sources));
  assertOk("policy exposes legacy source.url", typeof (first.source as Record<string, unknown> | undefined)?.url === "string");
  assertOk("policy exposes primary action text", typeof first.primaryActionText === "string");

  const id = encodeURIComponent(String(first.id || first.policyId || ""));
  const detail = await get(`/policies/${id}`);
  assertOk("GET /policies/:id returns 2xx", detail.status >= 200 && detail.status < 300, String(detail.status));
  assertOk("GET /policies/:id has policy", !!detail.data?.policy);
  assertOk("detail exposes sources[]", Array.isArray(detail.data.policy.sources));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
