import "dotenv/config";
import { PrismaClient } from "@prisma/client";

async function main() {
  const prisma = new PrismaClient();
  try {
    const users = await prisma.user.findMany({
      where: { nickname: { startsWith: "opc_" } },
      select: { id: true, nickname: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 3
    });
    console.log("recent opc_ users:", JSON.stringify(users, null, 2));
    if (!users.length) return;

    for (const u of users) {
      const convos = await prisma.conversation.findMany({
        where: { userId: u.id, deletedAt: null },
        select: { id: true, label: true, sceneKey: true, lastMessageAt: true, createdAt: true }
      });
      console.log(`\n${u.nickname} (${u.id}) conversations: ${convos.length}`);
      convos.forEach((c) =>
        console.log(
          `  - id=${c.id} scene=${c.sceneKey} label="${c.label}" last=${
            c.lastMessageAt?.toISOString?.() || String(c.lastMessageAt)
          }`
        )
      );

      const snaps = await prisma.reportSnapshot.findMany({
        where: { userId: u.id },
        select: { kind: true, updatedAt: true, data: true }
      });
      console.log(`\n${u.nickname} snapshots: ${snaps.length}`);
      for (const s of snaps) {
        if (s.kind === "ASSET_INVENTORY") {
          const fs = (s.data as Record<string, unknown>)?.flowState || {};
          console.log(`  ASSET_INVENTORY flowState:`, JSON.stringify(fs, null, 2));
        } else {
          console.log(
            `  ${s.kind} (updated ${s.updatedAt.toISOString?.() || String(s.updatedAt)})`
          );
        }
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
