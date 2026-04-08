import { PrismaClient, RouterAgentKey, RouterMode } from "@prisma/client";

const prisma = new PrismaClient();

type ArtifactTypeMap = Record<string, string>;

const PROJECT_ARTIFACT_TO_NEW_TYPE: ArtifactTypeMap = {
  asset_radar: "ASSET_RADAR",
  opportunity_score: "OPPORTUNITY_SCORES",
  business_health: "BUSINESS_HEALTH",
  pricing_card: "PRICING_CARD",
  park_match: "PARK_MATCH",
  action_plan_48h: "ACTION_PLAN_48H"
};

async function main() {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      createdAt: true
    }
  });

  for (const user of users) {
    await migrateConversationState(user.id);
    await migrateProjectArtifacts(user.id);
    await migrateLegacyMessageBehaviorLogs(user.id);
  }
}

async function migrateConversationState(userId: string) {
  const existing = await prisma.conversationState.findFirst({
    where: {
      userId
    }
  });
  if (existing) {
    return;
  }

  const latestConversation = await prisma.conversation.findFirst({
    where: {
      userId,
      deletedAt: null
    },
    orderBy: {
      updatedAt: "desc"
    }
  });

  const agentKey = inferAgentFromScene(latestConversation?.sceneKey || "");
  const mode: RouterMode = agentKey === "master" ? "guided" : "free";

  await prisma.conversationState.create({
    data: {
      userId,
      chatflowId: `cf_${agentKey}_bootstrap`,
      agentKey,
      mode,
      status: "in_progress",
      currentStep: "migrated_from_legacy",
      parkingLot: {
        legacyConversationId: latestConversation?.id || null
      }
    }
  });
}

async function migrateProjectArtifacts(userId: string) {
  const projectArtifacts = await prisma.projectArtifact.findMany({
    where: {
      project: {
        userId
      },
      deletedAt: null
    },
    orderBy: {
      createdAt: "asc"
    }
  });

  const versionByType = new Map<string, number>();

  for (const legacy of projectArtifacts) {
    const mappedType = mapArtifactType(legacy.type);
    const currentVersion = versionByType.get(mappedType) || 0;
    const nextVersion = currentVersion + 1;

    await prisma.artifact.create({
      data: {
        userId,
        type: mappedType as never,
        version: nextVersion,
        data: {
          title: legacy.title,
          summary: legacy.summary,
          meta: legacy.meta,
          raw: legacy.data
        }
      }
    });

    versionByType.set(mappedType, nextVersion);
  }
}

async function migrateLegacyMessageBehaviorLogs(userId: string) {
  const messageCount = await prisma.message.count({
    where: {
      userId
    }
  });
  if (!messageCount) {
    return;
  }

  const existed = await prisma.behaviorLog.findFirst({
    where: {
      userId,
      eventType: "message_sent"
    }
  });
  if (existed) {
    return;
  }

  await prisma.behaviorLog.create({
    data: {
      userId,
      eventType: "message_sent",
      eventData: {
        source: "legacy_messages",
        total: messageCount
      }
    }
  });
}

function mapArtifactType(legacyType: string) {
  const source = String(legacyType || "").trim().toLowerCase();
  return PROJECT_ARTIFACT_TO_NEW_TYPE[source] || "PROFILE_SNAPSHOT";
}

function inferAgentFromScene(sceneKey: string): RouterAgentKey {
  const source = String(sceneKey || "");
  if (/ip|asset|onboarding_path_explore/.test(source)) {
    return "asset";
  }
  if (/ai|execution/.test(source)) {
    return "execution";
  }
  if (/social|stuck|mindset/.test(source)) {
    return "mindset";
  }
  if (/company|monthly|park|steward/.test(source)) {
    return "steward";
  }
  return "master";
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
