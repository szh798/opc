import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { buildConversationLabelFromText } from "../src/shared/text-normalizer";

type PatchRow = {
  id: string;
  label: string;
  nextLabel: string;
  firstMessageId: string;
  firstMessageText: string;
  firstMessageAt: string;
};

async function main() {
  const prisma = new PrismaClient();
  const dryRun = process.env.DRY_RUN === "1";

  try {
    const candidates = await prisma.conversation.findMany({
      where: {
        deletedAt: null,
        label: {
          startsWith: "路由会话-"
        }
      },
      select: {
        id: true,
        label: true
      }
    });

    const patches: PatchRow[] = [];

    for (const conv of candidates) {
      const firstUserMessage = await prisma.message.findFirst({
        where: {
          conversationId: conv.id,
          role: "USER"
        },
        orderBy: {
          createdAt: "asc"
        },
        select: {
          id: true,
          text: true,
          createdAt: true
        }
      });

      if (!firstUserMessage) {
        continue;
      }

      const text = String(firstUserMessage.text || "").trim();
      if (!text) {
        continue;
      }

      const nextLabel = buildConversationLabelFromText(text, firstUserMessage.createdAt);
      if (nextLabel === conv.label) {
        continue;
      }

      patches.push({
        id: conv.id,
        label: conv.label,
        nextLabel,
        firstMessageId: firstUserMessage.id,
        firstMessageText: text,
        firstMessageAt: firstUserMessage.createdAt.toISOString()
      });
    }

    if (!patches.length) {
      console.log("[repair-router-labels] no router labels to update.");
      return;
    }

    const backupDir = path.resolve(process.cwd(), "storage", "repair-backups");
    await mkdir(backupDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = path.join(backupDir, `router-conversation-labels-${stamp}.json`);

    await writeFile(
      backupPath,
      JSON.stringify(
        {
          type: "router_conversation_label_backup",
          createdAt: new Date().toISOString(),
          dryRun,
          count: patches.length,
          rows: patches
        },
        null,
        2
      ),
      "utf8"
    );

    console.log(`[repair-router-labels] backup written: ${backupPath}`);
    console.log(`[repair-router-labels] candidate rows: ${patches.length}`);

    if (dryRun) {
      console.log("[repair-router-labels] DRY_RUN=1, skip database updates.");
      return;
    }

    await prisma.$transaction(
      patches.map((row) =>
        prisma.conversation.update({
          where: { id: row.id },
          data: {
            label: row.nextLabel
          }
        })
      )
    );

    console.log(`[repair-router-labels] updated rows: ${patches.length}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("[repair-router-labels] failed:", error);
  process.exit(1);
});

