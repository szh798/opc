-- Synchronize local database structure with the current Prisma schema.

CREATE TYPE "ArtifactType" AS ENUM (
  'ASSET_RADAR',
  'OPPORTUNITY_SCORES',
  'SELECTED_DIRECTION',
  'VALIDATION_PLAN',
  'BUSINESS_HEALTH',
  'PRODUCT_STRUCTURE',
  'PRICING_CARD',
  'OUTREACH_SCRIPTS',
  'REVENUE_STRUCTURE',
  'PROFIT_FIRST_CONFIG',
  'PARK_MATCH',
  'ACTION_PLAN_48H',
  'AUTOMATION_WORKFLOW',
  'PROFILE_SNAPSHOT',
  'WEEKLY_REPORT',
  'MONTHLY_REPORT',
  'SOCIAL_PROOF',
  'MILESTONE',
  'SHARE_PREVIEW'
);

CREATE TYPE "RouterAgentKey" AS ENUM ('master', 'asset', 'execution', 'mindset', 'steward');
CREATE TYPE "RouterMode" AS ENUM ('guided', 'locked', 'free');
CREATE TYPE "RouterSessionStatus" AS ENUM ('in_progress', 'completed', 'abandoned');
CREATE TYPE "BehaviorEventType" AS ENUM (
  'app_open',
  'message_sent',
  'task_completed',
  'task_skipped',
  'agent_switched',
  'artifact_viewed',
  'knowledge_browsed',
  'project_created'
);
CREATE TYPE "SubscriptionTokenStatus" AS ENUM ('available', 'used', 'expired');
CREATE TYPE "DailyTaskStatus" AS ENUM ('pending', 'completed', 'skipped');

ALTER TYPE "ChatflowSummaryTrigger" ADD VALUE 'cron_daily';
ALTER TYPE "ChatflowSummaryTrigger" ADD VALUE 'cron_weekly';

ALTER TABLE "DailyTask"
ADD COLUMN "agentKey" VARCHAR(32),
ADD COLUMN "content" TEXT,
ADD COLUMN "dueDate" TIMESTAMP(3),
ADD COLUMN "projectId" VARCHAR(128),
ADD COLUMN "status" "DailyTaskStatus" NOT NULL DEFAULT 'pending';

ALTER TABLE "User"
ADD COLUMN "entryPath" VARCHAR(64),
ADD COLUMN "isActiveOpc" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "lastActiveAt" TIMESTAMP(3),
ADD COLUMN "onboardingCompleted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "subscriptionCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "wechatOpenid" VARCHAR(128);

CREATE TABLE "Artifact" (
  "id" TEXT NOT NULL,
  "userId" VARCHAR(64) NOT NULL,
  "type" "ArtifactType" NOT NULL,
  "data" JSONB NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Artifact_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ConversationState" (
  "id" VARCHAR(128) NOT NULL,
  "userId" VARCHAR(64) NOT NULL,
  "chatflowId" VARCHAR(128) NOT NULL,
  "agentKey" "RouterAgentKey" NOT NULL,
  "mode" "RouterMode" NOT NULL,
  "status" "RouterSessionStatus" NOT NULL,
  "currentStep" VARCHAR(120),
  "pendingQuestion" TEXT,
  "clarifyCount" INTEGER NOT NULL DEFAULT 0,
  "parkingLot" JSONB,
  "difyConversationId" VARCHAR(255),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ConversationState_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BehaviorLog" (
  "id" TEXT NOT NULL,
  "userId" VARCHAR(64) NOT NULL,
  "eventType" "BehaviorEventType" NOT NULL,
  "eventData" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "BehaviorLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SubscriptionToken" (
  "id" TEXT NOT NULL,
  "userId" VARCHAR(64) NOT NULL,
  "templateId" VARCHAR(128) NOT NULL,
  "status" "SubscriptionTokenStatus" NOT NULL DEFAULT 'available',
  "triggeredAt" TIMESTAMP(3),
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SubscriptionToken_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Artifact_userId_type_updatedAt_idx" ON "Artifact"("userId", "type", "updatedAt");
CREATE UNIQUE INDEX "Artifact_userId_type_version_key" ON "Artifact"("userId", "type", "version");
CREATE INDEX "ConversationState_userId_status_updatedAt_idx" ON "ConversationState"("userId", "status", "updatedAt");
CREATE INDEX "BehaviorLog_userId_eventType_createdAt_idx" ON "BehaviorLog"("userId", "eventType", "createdAt");
CREATE INDEX "SubscriptionToken_userId_status_createdAt_idx" ON "SubscriptionToken"("userId", "status", "createdAt");
CREATE UNIQUE INDEX "User_wechatOpenid_key" ON "User"("wechatOpenid");

ALTER TABLE "Artifact"
ADD CONSTRAINT "Artifact_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ConversationState"
ADD CONSTRAINT "ConversationState_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BehaviorLog"
ADD CONSTRAINT "BehaviorLog_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SubscriptionToken"
ADD CONSTRAINT "SubscriptionToken_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
