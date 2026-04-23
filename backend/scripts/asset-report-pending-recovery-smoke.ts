import { randomUUID } from "node:crypto";
import { ProfileService } from "../src/profile.service";
import { PrismaService } from "../src/shared/prisma.service";

async function main() {
  const prisma = new PrismaService();
  const userId = `smoke-pending-${randomUUID()}`;

  try {
    await prisma.$connect();
    await prisma.user.create({
      data: {
        id: userId,
        name: "Smoke Pending User",
        nickname: "Smoke Pending User",
        initial: "S"
      }
    });

    const profileService = new ProfileService(
      prisma as any,
      {} as any,
      {} as any,
      {} as any
    );

    await profileService.updateAssetInventoryFromFlowState(userId, {
      conversationId: `asset-recovery-${Date.now()}`,
      inventoryStage: "ready_for_report",
      profileSnapshot: "已完成资产盘点",
      dimensionReports: "四维分析完成",
      reportBrief: "等待生成报告",
      reportStatus: "pending"
    });

    const staleUpdatedAt = new Date(Date.now() - 20 * 60 * 1000);
    await prisma.$executeRawUnsafe(
      'UPDATE "ReportSnapshot" SET "updatedAt" = $1 WHERE "userId" = $2 AND "kind" = \'ASSET_INVENTORY\'',
      staleUpdatedAt,
      userId
    );

    const recovered = await profileService.recoverStalePendingAssetReport(userId, {
      staleAfterMs: 5 * 60 * 1000,
      now: new Date()
    });

    const status = String(recovered?.flowState?.reportStatus || "");
    const error = String(recovered?.flowState?.reportError || "");
    if (status !== "failed") {
      throw new Error(`expected recovered status to be failed, received ${status || "<empty>"}`);
    }
    if (!error.includes("报告生成超时")) {
      throw new Error(`expected timeout error message, received ${error || "<empty>"}`);
    }

    console.log("[PASS] asset report pending recovery");
  } finally {
    await prisma.user.deleteMany({
      where: {
        id: userId
      }
    });
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(
    `[FAIL] asset report pending recovery - ${error instanceof Error ? error.message : String(error)}`
  );
  process.exitCode = 1;
});
