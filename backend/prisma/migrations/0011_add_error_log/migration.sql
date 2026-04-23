-- Phase B1: 错误上报持久化
CREATE TABLE "ErrorLog" (
  "id" TEXT PRIMARY KEY,
  "source" VARCHAR(16) NOT NULL,
  "level" VARCHAR(16) NOT NULL,
  "userId" VARCHAR(64),
  "requestId" VARCHAR(128),
  "route" VARCHAR(255),
  "message" VARCHAR(1024) NOT NULL,
  "stack" TEXT,
  "context" JSONB,
  "userAgent" VARCHAR(512),
  "appVersion" VARCHAR(64),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX "ErrorLog_source_createdAt_idx" ON "ErrorLog"("source", "createdAt");
CREATE INDEX "ErrorLog_userId_createdAt_idx" ON "ErrorLog"("userId", "createdAt");
CREATE INDEX "ErrorLog_level_createdAt_idx" ON "ErrorLog"("level", "createdAt");
