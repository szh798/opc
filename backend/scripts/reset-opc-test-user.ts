import "dotenv/config";
import { PrismaClient, SnapshotKind } from "@prisma/client";

// 一次性脚本:清掉测试用户 opc_814c0f6303 的 ASSET_INVENTORY 快照 + router 会话,
// 让用户在微信开发者工具里能以"全新 turn 1"的状态重新跑 golden path B 的入口。
// 只影响这一个用户,其他 opc_ 测试用户不动。

const TARGET_NICKNAME = "opc_814c0f6303";

async function main() {
  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.findFirst({ where: { nickname: TARGET_NICKNAME } });
    if (!user) {
      console.log(`user not found: ${TARGET_NICKNAME}`);
      return;
    }
    console.log(`resetting ${user.nickname} (${user.id})`);

    const snap = await prisma.reportSnapshot.deleteMany({
      where: { userId: user.id, kind: SnapshotKind.ASSET_INVENTORY }
    });
    console.log(`  deleted ${snap.count} ASSET_INVENTORY snapshot rows`);

    const convos = await prisma.conversation.deleteMany({ where: { userId: user.id } });
    console.log(`  deleted ${convos.count} conversation rows`);

    const states = await prisma.conversationState.deleteMany({ where: { userId: user.id } });
    console.log(`  deleted ${states.count} conversationState rows`);
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
