-- CreateEnum
CREATE TYPE "MessageRole" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "SnapshotKind" AS ENUM ('PROFILE', 'WEEKLY_REPORT', 'MONTHLY_REPORT', 'SOCIAL_PROOF', 'MILESTONE', 'SHARE_PREVIEW');

-- CreateTable
CREATE TABLE "User" (
    "id" VARCHAR(64) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "nickname" VARCHAR(120) NOT NULL,
    "initial" VARCHAR(8) NOT NULL,
    "stage" VARCHAR(120),
    "streakDays" INTEGER NOT NULL DEFAULT 0,
    "subtitle" VARCHAR(255),
    "avatarUrl" VARCHAR(2048),
    "loggedIn" BOOLEAN NOT NULL DEFAULT false,
    "loginMode" VARCHAR(64),
    "openId" VARCHAR(128),
    "unionId" VARCHAR(128),
    "gender" INTEGER,
    "country" VARCHAR(80),
    "province" VARCHAR(80),
    "city" VARCHAR(80),
    "language" VARCHAR(32),
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WechatIdentity" (
    "id" TEXT NOT NULL,
    "userId" VARCHAR(64) NOT NULL,
    "openId" VARCHAR(128),
    "unionId" VARCHAR(128),
    "sessionKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WechatIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" VARCHAR(64) NOT NULL,
    "userId" VARCHAR(64) NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "accessTokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "refreshTokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" VARCHAR(128) NOT NULL,
    "userId" VARCHAR(64) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "phase" VARCHAR(80),
    "status" VARCHAR(80),
    "statusTone" VARCHAR(80),
    "color" VARCHAR(32),
    "agentLabel" VARCHAR(80),
    "conversation" JSONB,
    "conversationReplies" JSONB,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectArtifact" (
    "id" VARCHAR(128) NOT NULL,
    "projectId" VARCHAR(128) NOT NULL,
    "type" VARCHAR(64) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "data" JSONB,
    "meta" VARCHAR(255),
    "summary" TEXT,
    "cta" JSONB,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectArtifact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" VARCHAR(128) NOT NULL,
    "userId" VARCHAR(64) NOT NULL,
    "sceneKey" VARCHAR(128),
    "label" VARCHAR(255) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastMessageAt" TIMESTAMP(3),

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderConversation" (
    "id" TEXT NOT NULL,
    "conversationId" VARCHAR(128) NOT NULL,
    "providerConversationId" VARCHAR(255) NOT NULL,
    "lastProviderMessageId" VARCHAR(255),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" VARCHAR(128) NOT NULL,
    "conversationId" VARCHAR(128) NOT NULL,
    "userId" VARCHAR(64) NOT NULL,
    "role" "MessageRole" NOT NULL,
    "type" VARCHAR(32) NOT NULL,
    "text" TEXT NOT NULL,
    "agentKey" VARCHAR(32),
    "providerMessageId" VARCHAR(255),
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StreamEvent" (
    "id" TEXT NOT NULL,
    "streamId" VARCHAR(128) NOT NULL,
    "conversationId" VARCHAR(128) NOT NULL,
    "eventIndex" INTEGER NOT NULL,
    "type" VARCHAR(32) NOT NULL,
    "payload" JSONB NOT NULL,
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StreamEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyTask" (
    "id" VARCHAR(128) NOT NULL,
    "userId" VARCHAR(64) NOT NULL,
    "label" VARCHAR(120) NOT NULL,
    "tag" VARCHAR(120),
    "done" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskFeedback" (
    "id" TEXT NOT NULL,
    "userId" VARCHAR(64) NOT NULL,
    "taskId" VARCHAR(128),
    "taskLabel" VARCHAR(120),
    "summary" TEXT,
    "advice" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrowthSnapshot" (
    "id" TEXT NOT NULL,
    "userId" VARCHAR(64) NOT NULL,
    "overview" JSONB NOT NULL,
    "milestones" JSONB NOT NULL,
    "currentMilestone" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GrowthSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportSnapshot" (
    "id" TEXT NOT NULL,
    "userId" VARCHAR(64) NOT NULL,
    "kind" "SnapshotKind" NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShareRecord" (
    "id" VARCHAR(128) NOT NULL,
    "userId" VARCHAR(64) NOT NULL,
    "resultId" VARCHAR(128),
    "title" VARCHAR(200),
    "caption" TEXT,
    "hashtags" JSONB,
    "posterPath" TEXT,
    "imageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShareRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "User_deletedAt_idx" ON "User"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WechatIdentity_openId_key" ON "WechatIdentity"("openId");

-- CreateIndex
CREATE UNIQUE INDEX "WechatIdentity_unionId_key" ON "WechatIdentity"("unionId");

-- CreateIndex
CREATE INDEX "WechatIdentity_userId_idx" ON "WechatIdentity"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_refreshToken_key" ON "Session"("refreshToken");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_revokedAt_idx" ON "Session"("revokedAt");

-- CreateIndex
CREATE INDEX "Project_userId_deletedAt_idx" ON "Project"("userId", "deletedAt");

-- CreateIndex
CREATE INDEX "ProjectArtifact_projectId_deletedAt_idx" ON "ProjectArtifact"("projectId", "deletedAt");

-- CreateIndex
CREATE INDEX "Conversation_userId_deletedAt_updatedAt_idx" ON "Conversation"("userId", "deletedAt", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderConversation_conversationId_key" ON "ProviderConversation"("conversationId");

-- CreateIndex
CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "Message_userId_createdAt_idx" ON "Message"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "StreamEvent_streamId_deliveredAt_eventIndex_idx" ON "StreamEvent"("streamId", "deliveredAt", "eventIndex");

-- CreateIndex
CREATE UNIQUE INDEX "StreamEvent_streamId_eventIndex_key" ON "StreamEvent"("streamId", "eventIndex");

-- CreateIndex
CREATE INDEX "DailyTask_userId_done_idx" ON "DailyTask"("userId", "done");

-- CreateIndex
CREATE INDEX "TaskFeedback_userId_createdAt_idx" ON "TaskFeedback"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "GrowthSnapshot_userId_key" ON "GrowthSnapshot"("userId");

-- CreateIndex
CREATE INDEX "ReportSnapshot_userId_kind_idx" ON "ReportSnapshot"("userId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "ReportSnapshot_userId_kind_key" ON "ReportSnapshot"("userId", "kind");

-- CreateIndex
CREATE INDEX "ShareRecord_userId_createdAt_idx" ON "ShareRecord"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "WechatIdentity" ADD CONSTRAINT "WechatIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectArtifact" ADD CONSTRAINT "ProjectArtifact_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderConversation" ADD CONSTRAINT "ProviderConversation_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StreamEvent" ADD CONSTRAINT "StreamEvent_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyTask" ADD CONSTRAINT "DailyTask_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskFeedback" ADD CONSTRAINT "TaskFeedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrowthSnapshot" ADD CONSTRAINT "GrowthSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportSnapshot" ADD CONSTRAINT "ReportSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareRecord" ADD CONSTRAINT "ShareRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

