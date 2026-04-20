-- Phase A4 —— Dify 调用用量追踪
-- 每次 Dify chat/stream/workflow 调用后异步落一行，用于后续配额校验与成本看板。

CREATE TABLE "DifyUsageLog" (
  "id" TEXT PRIMARY KEY,
  "userId" VARCHAR(64),
  "workflowKey" VARCHAR(64) NOT NULL,
  "apiKeyTag" VARCHAR(64) NOT NULL,
  "conversationId" VARCHAR(128),
  "messageId" VARCHAR(128),
  "status" VARCHAR(24) NOT NULL,
  "promptTokens" INTEGER NOT NULL DEFAULT 0,
  "completionTokens" INTEGER NOT NULL DEFAULT 0,
  "totalTokens" INTEGER NOT NULL DEFAULT 0,
  "latencyMs" INTEGER NOT NULL DEFAULT 0,
  "costCents" INTEGER NOT NULL DEFAULT 0,
  "errorCode" VARCHAR(64),
  "errorMessage" VARCHAR(512),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "DifyUsageLog_userId_createdAt_idx"
  ON "DifyUsageLog" ("userId", "createdAt");
CREATE INDEX "DifyUsageLog_workflowKey_createdAt_idx"
  ON "DifyUsageLog" ("workflowKey", "createdAt");
CREATE INDEX "DifyUsageLog_status_createdAt_idx"
  ON "DifyUsageLog" ("status", "createdAt");
