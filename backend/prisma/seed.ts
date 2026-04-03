import { Prisma, PrismaClient, SnapshotKind } from "@prisma/client";
import * as path from "node:path";

const prisma = new PrismaClient();
const repoRoot = path.resolve(__dirname, "..", "..");

function loadModule<T>(relativePath: string): T {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require(path.resolve(repoRoot, relativePath)) as T;
}

async function main() {
  const { user } = loadModule<{ user: Record<string, unknown> }>("mock/user.js");
  const { projects, projectDetails } = loadModule<{
    projects: Array<Record<string, unknown>>;
    projectDetails: Record<string, Record<string, unknown>>;
  }>("mock/projects.js");
  const { recentChats } = loadModule<{ recentChats: Array<Record<string, unknown>> }>("mock/sidebar.js");
  const { profile } = loadModule<{ profile: Record<string, unknown> }>("mock/profile.js");
  const reports = loadModule<Record<string, unknown>>("mock/reports.js");
  const shareService = loadModule<{ getSharePreview: () => Record<string, unknown> }>("services/share.service.js");

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

  const demoUserId = String(user.id || "mock-user-001");

  await prisma.user.create({
    data: {
      id: demoUserId,
      name: String(user.name || "小明"),
      nickname: String(user.nickname || user.name || "小明"),
      initial: String(user.initial || "小"),
      stage: String(user.stage || ""),
      streakDays: Number(user.streakDays || 0),
      subtitle: String(user.subtitle || ""),
      loggedIn: false,
      loginMode: ""
    }
  });

  await prisma.reportSnapshot.createMany({
    data: [
      {
        userId: demoUserId,
        kind: SnapshotKind.PROFILE,
        data: profile as Prisma.InputJsonValue
      },
      {
        userId: demoUserId,
        kind: SnapshotKind.WEEKLY_REPORT,
        data: reports.weeklyReport as Prisma.InputJsonValue
      },
      {
        userId: demoUserId,
        kind: SnapshotKind.MONTHLY_REPORT,
        data: reports.monthlyCheck as Prisma.InputJsonValue
      },
      {
        userId: demoUserId,
        kind: SnapshotKind.SOCIAL_PROOF,
        data: reports.socialProof as Prisma.InputJsonValue
      },
      {
        userId: demoUserId,
        kind: SnapshotKind.MILESTONE,
        data: reports.milestone as Prisma.InputJsonValue
      },
      {
        userId: demoUserId,
        kind: SnapshotKind.SHARE_PREVIEW,
        data: shareService.getSharePreview() as Prisma.InputJsonValue
      }
    ]
  });

  await prisma.growthSnapshot.create({
    data: {
      userId: demoUserId,
      overview: reports.treeOverview as Prisma.InputJsonValue,
      milestones: reports.treeMilestones as Prisma.InputJsonValue,
      currentMilestone: reports.milestone as Prisma.InputJsonValue
    }
  });

  for (const project of projects) {
    const projectId = String(project.id || `project-${Date.now()}`);
    const detail = projectDetails[projectId] || {};

    await prisma.project.create({
      data: {
        id: projectId,
        userId: demoUserId,
        name: String(project.name || "新项目"),
        phase: String(project.phase || ""),
        status: String(project.status || ""),
        statusTone: String(project.statusTone || ""),
        color: String(project.color || ""),
        agentLabel: String(detail.agentLabel || ""),
        conversation: Array.isArray(detail.conversation) ? detail.conversation : [],
        conversationReplies: Array.isArray(detail.conversationReplies) ? detail.conversationReplies : []
      }
    });

    const artifacts = Array.isArray(detail.artifacts) ? detail.artifacts : [];
    for (const artifact of artifacts) {
      const { id, type, title, meta, summary, cta, ...data } = artifact as Record<string, unknown>;
      await prisma.projectArtifact.create({
        data: {
          id: String(id || `artifact-${Date.now()}`),
          projectId,
          type: String(type || "artifact"),
          title: String(title || "未命名成果"),
          data: data as Prisma.InputJsonValue,
          meta: typeof meta === "string" ? meta : "",
          summary: typeof summary === "string" ? summary : "",
          cta: cta && typeof cta === "object" ? cta as Prisma.InputJsonValue : undefined
        }
      });
    }
  }

  for (const chat of recentChats) {
    await prisma.conversation.create({
      data: {
        id: String(chat.id || `recent-${Date.now()}`),
        userId: demoUserId,
        sceneKey: "home",
        label: String(chat.label || "新对话"),
        lastMessageAt: new Date()
      }
    });
  }

  await prisma.dailyTask.createMany({
    data: [
      {
        id: `${demoUserId}-task-1`,
        userId: demoUserId,
        label: "触达5个潜在客户",
        tag: "自媒体项目"
      },
      {
        id: `${demoUserId}-task-2`,
        userId: demoUserId,
        label: "发一条小红书",
        tag: "IP杠杆"
      },
      {
        id: `${demoUserId}-task-3`,
        userId: demoUserId,
        label: "跟进昨天的意向客户",
        tag: "自媒体项目"
      }
    ]
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
