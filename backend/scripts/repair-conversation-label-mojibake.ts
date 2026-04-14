import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { normalizeKnownMojibake, hasLikelyMojibake } from "../src/shared/text-normalizer";

type ConversationRow = {
  id: string;
  label: string;
  updatedAt: Date;
};

async function main() {
  const prisma = new PrismaClient();
  const dryRun = process.env.DRY_RUN === "1";

  try {
    const rows = await prisma.conversation.findMany({
      where: {
        deletedAt: null
      },
      select: {
        id: true,
        label: true,
        updatedAt: true
      }
    });

    const targets = rows
      .filter((row) => hasLikelyMojibake(row.label))
      .map((row) => {
        const nextLabel = normalizeKnownMojibake(row.label);
        return {
          ...row,
          nextLabel
        };
      })
      .filter((row) => row.nextLabel !== row.label);

    if (!targets.length) {
      console.log("[repair] no mojibake labels detected, nothing to update.");
      return;
    }

    const backupDir = path.resolve(process.cwd(), "storage", "repair-backups");
    await mkdir(backupDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = path.join(backupDir, `conversation-label-mojibake-${stamp}.json`);

    await writeFile(
      backupPath,
      JSON.stringify(
        {
          type: "conversation_label_mojibake_backup",
          createdAt: new Date().toISOString(),
          dryRun,
          count: targets.length,
          rows: targets.map((row) => ({
            id: row.id,
            label: row.label,
            nextLabel: row.nextLabel,
            updatedAt: row.updatedAt.toISOString()
          }))
        },
        null,
        2
      ),
      "utf8"
    );

    console.log(`[repair] backup written: ${backupPath}`);
    console.log(`[repair] candidate rows: ${targets.length}`);

    if (dryRun) {
      console.log("[repair] DRY_RUN=1, skip database updates.");
      return;
    }

    await prisma.$transaction(
      targets.map((row) =>
        prisma.conversation.update({
          where: { id: row.id },
          data: { label: row.nextLabel }
        })
      )
    );

    console.log(`[repair] updated rows: ${targets.length}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("[repair] failed:", error);
  process.exit(1);
});
