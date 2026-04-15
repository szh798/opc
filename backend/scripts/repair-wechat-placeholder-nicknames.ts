import "dotenv/config";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";

// 历史上 wx.getUserProfile 返回的占位名被原样落库到 user.name / user.nickname,
// 导致一批用户全都叫 "微信用户"。此脚本把这些行批量重置成 opc_xxxxxxxxxx 动态占位,
// 与 auth.service.ts 的 buildFreshNicknamePlaceholder() 保持一致格式。
//
// 用法:
//   DRY_RUN=1 npx ts-node scripts/repair-wechat-placeholder-nicknames.ts   # 只打印,不改库
//   npx ts-node scripts/repair-wechat-placeholder-nicknames.ts             # 真正执行

const PLACEHOLDER_NICKNAMES = new Set([
  "微信用户",
  "wechatuser",
  "wx-user",
  "wxuser",
  "小明" // 顺手也一起清掉 demo-user 污染时期残留的 "小明" 真实用户
]);

function buildFreshNicknamePlaceholder() {
  const suffix = randomUUID().replace(/-/g, "").slice(0, 10).toLowerCase();
  return `opc_${suffix}`;
}

function isPlaceholder(value: string | null | undefined) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return false;
  return PLACEHOLDER_NICKNAMES.has(trimmed.toLowerCase()) || PLACEHOLDER_NICKNAMES.has(trimmed);
}

async function main() {
  const prisma = new PrismaClient();
  const dryRun = process.env.DRY_RUN === "1";

  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        nickname: true,
        initial: true
      }
    });

    // mock-user-001 是 DEMO_USER_TEMPLATE 的运行时镜像,产品里 "小明" 这个角色的
    // 载体 (mock reports / PRODUCT_MANUAL 都围绕它),必须保留,不能重命名。
    const DEMO_USER_ID = "mock-user-001";
    const targets = users.filter(
      (u) =>
        u.id !== DEMO_USER_ID && (isPlaceholder(u.name) || isPlaceholder(u.nickname))
    );

    console.log(`[repair] scanned ${users.length} users, found ${targets.length} placeholder rows`);

    if (!targets.length) {
      console.log("[repair] nothing to do");
      return;
    }

    for (const user of targets) {
      const nextNickname = buildFreshNicknamePlaceholder();
      const nextInitial = nextNickname.slice(0, 1);
      console.log(
        `[repair] ${user.id}  "${user.name}" / "${user.nickname}"  ->  "${nextNickname}"`
      );

      if (dryRun) continue;

      await prisma.user.update({
        where: { id: user.id },
        data: {
          name: nextNickname,
          nickname: nextNickname,
          initial: nextInitial
        }
      });
    }

    console.log(dryRun ? "[repair] DRY_RUN=1, no changes committed" : "[repair] done");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("[repair] failed:", error);
  process.exit(1);
});
