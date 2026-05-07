import "dotenv/config";
import { PolicyCatalogService } from "../src/policy/policy-catalog.service";
import { PrismaService } from "../src/shared/prisma.service";
import type { PolicyCatalogItem, PolicyCollectedSlots } from "../src/policy/policy.types";

const CASES = ["北京", "深圳", "武汉", "杭州", "广州", "重庆"] as const;

function assertOk(label: string, condition: unknown, detail = ""): asserts condition {
  if (!condition) {
    throw new Error(`Assertion failed: ${label}${detail ? ` - ${detail}` : ""}`);
  }
  console.log(`[ok] ${label}${detail ? ` - ${detail}` : ""}`);
}

function buildSlots(city: string): PolicyCollectedSlots {
  return {
    companyStatus: "unregistered",
    region: {
      rawText: city,
      city
    },
    industry: {
      rawText: "软件",
      label: "软件"
    },
    age: null,
    revenue: {
      bucket: "none",
      rawText: "没有收入"
    }
  };
}

function isLocal(policy: PolicyCatalogItem, city: string) {
  const normalizedCity = normalizeRegion(city);
  const text = [policy.region, policy.province, policy.city, policy.district]
    .map((value) => normalizeRegion(value || ""))
    .join(" ");
  return text.includes(normalizedCity);
}

function normalizeRegion(value: string) {
  return String(value || "")
    .trim()
    .replace(/(市|省|区|县|新区|自治州|特别行政区)$/g, "");
}

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();
  try {
    const catalog = new PolicyCatalogService(prisma);
    for (const city of CASES) {
      const candidates = await catalog.findCandidatePolicies(buildSlots(city), { limit: 10 });
      assertOk(`${city} has local catalog candidates`, candidates.length > 0);
      const wrong = candidates.filter((policy) => !isLocal(policy, city));
      assertOk(
        `${city} candidates do not cross city`,
        wrong.length === 0,
        wrong.map((policy) => `${policy.title}@${policy.region}`).join(" | ")
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
