import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { hasLikelyMojibake, normalizeKnownMojibake } from "../src/shared/text-normalizer";

async function main() {
  const prisma = new PrismaClient();
  try {
    const [settings] = (await prisma.$queryRawUnsafe(
      "select current_setting('server_encoding') as server_encoding, current_setting('client_encoding') as client_encoding"
    )) as Array<{ server_encoding: string; client_encoding: string }>;

    console.log("[encoding] db server_encoding =", settings?.server_encoding || "unknown");
    console.log("[encoding] db client_encoding =", settings?.client_encoding || "unknown");

    const recent = await prisma.conversation.findMany({
      where: { deletedAt: null },
      orderBy: { updatedAt: "desc" },
      take: 100,
      select: { id: true, label: true, updatedAt: true }
    });

    const suspicious = recent
      .filter((row) => hasLikelyMojibake(row.label))
      .map((row) => ({
        ...row,
        normalized: normalizeKnownMojibake(row.label)
      }));

    console.log("[encoding] recent conversations scanned =", recent.length);
    console.log("[encoding] suspicious labels =", suspicious.length);
    if (suspicious.length) {
      console.log(
        suspicious.map((item) => ({
          id: item.id,
          label: item.label,
          normalized: item.normalized,
          updatedAt: item.updatedAt.toISOString()
        }))
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("[encoding] diagnose failed:", error);
  process.exit(1);
});
