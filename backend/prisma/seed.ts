import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.streamEvent.deleteMany();
  await prisma.message.deleteMany();
  await prisma.providerConversation.deleteMany();
  await prisma.shareRecord.deleteMany();
  await prisma.projectArtifact.deleteMany();
  await prisma.project.deleteMany();
  await prisma.session.deleteMany();
  await prisma.wechatIdentity.deleteMany();
  await prisma.dailyTask.deleteMany();
  await prisma.taskFeedback.deleteMany();
  await prisma.growthSnapshot.deleteMany();
  await prisma.reportSnapshot.deleteMany();
  await prisma.conversation.deleteMany();
  await prisma.user.deleteMany();
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
