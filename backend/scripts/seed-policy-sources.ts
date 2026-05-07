import "dotenv/config";
import { Prisma } from "@prisma/client";
import * as fs from "node:fs";
import * as path from "node:path";
import { normalizeSeedPolicyRecord } from "../src/policy/policy-catalog.service";
import { PrismaService } from "../src/shared/prisma.service";

const prisma = new PrismaService();
const DEFAULT_SEED_PATH = path.join(
  process.cwd(),
  "prisma",
  "seed-data",
  "opc-policies-2026-05-07.sources.json"
);

async function main() {
  const seedPath = path.resolve(process.argv[2] || DEFAULT_SEED_PATH);
  if (!fs.existsSync(seedPath)) {
    throw new Error(`Policy seed file not found: ${seedPath}`);
  }

  const raw = JSON.parse(fs.readFileSync(seedPath, "utf8")) as unknown;
  const records = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as { policies?: unknown[] }).policies)
      ? (raw as { policies: unknown[] }).policies
      : null;

  if (!records) {
    throw new Error("Policy seed file must be an array or an object with policies[]");
  }

  let policyCount = 0;
  let sourceCount = 0;
  const warnings: string[] = [];

  for (const [index, record] of records.entries()) {
    if (!record || typeof record !== "object" || Array.isArray(record)) {
      warnings.push(`policy[${index}] skipped: not an object`);
      continue;
    }

    const normalized = normalizeSeedPolicyRecord(record as Record<string, unknown>);
    if (!normalized.policy) {
      warnings.push(`policy[${index}] skipped: ${normalized.warnings.join("; ")}`);
      continue;
    }
    for (const warning of normalized.warnings) {
      warnings.push(`${normalized.policy.id}: ${warning}`);
    }
    const policyData = {
      ...normalized.policy,
      metadata: normalized.policy.metadata as Prisma.InputJsonValue
    };

    await prisma.$transaction(async (tx) => {
      await tx.policyItem.upsert({
        where: { id: normalized.policy.id },
        create: policyData,
        update: {
          region: normalized.policy.region,
          province: normalized.policy.province,
          city: normalized.policy.city,
          district: normalized.policy.district,
          title: normalized.policy.title,
          summary: normalized.policy.summary,
          status: normalized.policy.status,
          fineTags: normalized.policy.fineTags,
          sourceDate: normalized.policy.sourceDate,
          lastVerifiedAt: normalized.policy.lastVerifiedAt,
          isActive: normalized.policy.isActive,
          priority: normalized.policy.priority,
          metadata: policyData.metadata
        }
      });

      const sourceKeys = normalized.sources.map((source) => source.sourceKey);
      if (sourceKeys.length) {
        await tx.policySource.deleteMany({
          where: {
            policyId: normalized.policy.id,
            sourceKey: {
              notIn: sourceKeys
            }
          }
        });
      } else {
        await tx.policySource.deleteMany({
          where: {
            policyId: normalized.policy.id
          }
        });
      }

      for (const source of normalized.sources) {
        await tx.policySource.upsert({
          where: {
            policyId_sourceKey: {
              policyId: normalized.policy.id,
              sourceKey: source.sourceKey
            }
          },
          create: {
            policyId: normalized.policy.id,
            sourceKey: source.sourceKey,
            type: source.type,
            label: source.label,
            url: source.url,
            note: source.note || null,
            sortOrder: source.sortOrder
          },
          update: {
            type: source.type,
            label: source.label,
            url: source.url,
            note: source.note || null,
            sortOrder: source.sortOrder
          }
        });
      }
    });

    policyCount += 1;
    sourceCount += normalized.sources.length;
  }

  for (const warning of warnings) {
    console.warn(`[policy-seed] ${warning}`);
  }
  console.log(`[policy-seed] imported policies=${policyCount} sources=${sourceCount}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
