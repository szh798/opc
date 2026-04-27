ALTER TYPE "DailyTaskStatus" ADD VALUE IF NOT EXISTS 'blocked';
ALTER TYPE "DailyTaskStatus" ADD VALUE IF NOT EXISTS 'closed';
ALTER TYPE "DailyTaskStatus" ADD VALUE IF NOT EXISTS 'carried_over';

ALTER TABLE "Project"
ADD COLUMN "projectKind" VARCHAR(32) NOT NULL DEFAULT 'active_project',
ADD COLUMN "projectStage" VARCHAR(64),
ADD COLUMN "followupStatus" VARCHAR(32),
ADD COLUMN "leadAgentRole" VARCHAR(32),
ADD COLUMN "workspaceVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "candidateSetId" VARCHAR(128),
ADD COLUMN "candidateSetVersion" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "initiationSummaryVersion" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "selectedDirectionSnapshot" JSONB,
ADD COLUMN "deepDiveSummary" TEXT,
ADD COLUMN "currentValidationQuestion" TEXT,
ADD COLUMN "selectionReason" TEXT,
ADD COLUMN "currentFollowupCycle" JSONB,
ADD COLUMN "initiatedAt" TIMESTAMP(3),
ADD COLUMN "followupCadenceDays" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN "nextFollowupAt" TIMESTAMP(3),
ADD COLUMN "lastFollowupAt" TIMESTAMP(3);

ALTER TABLE "DailyTask"
ADD COLUMN "cycleNo" INTEGER,
ADD COLUMN "taskType" VARCHAR(64),
ADD COLUMN "feedback" TEXT,
ADD COLUMN "evidence" JSONB;

ALTER TABLE "SubscriptionToken"
ADD COLUMN "scene" VARCHAR(64),
ADD COLUMN "grantedAt" TIMESTAMP(3),
ADD COLUMN "expiresAt" TIMESTAMP(3),
ADD COLUMN "consumedAt" TIMESTAMP(3),
ADD COLUMN "sendStatus" VARCHAR(32);

CREATE INDEX "Project_userId_projectKind_deletedAt_idx" ON "Project"("userId", "projectKind", "deletedAt");
CREATE INDEX "Project_userId_projectKind_followupStatus_nextFollowupAt_idx" ON "Project"("userId", "projectKind", "followupStatus", "nextFollowupAt");
CREATE INDEX "DailyTask_projectId_cycleNo_status_idx" ON "DailyTask"("projectId", "cycleNo", "status");
