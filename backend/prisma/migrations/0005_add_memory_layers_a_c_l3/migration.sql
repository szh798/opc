-- Phase 1.4 / 1.5 / 1.6 —— 新增 Layer A 会话窗口 / Layer C 摘要 / L3 聚合画像
-- 对齐 abundant-forging-papert.md §3.2 §3.4 §4.1
-- 本迁移不触碰旧 MemoryEntry 表，后续可单独走一个 drop migration 清理。

-- ============================================
-- Enums
-- ============================================
DO $$ BEGIN
  CREATE TYPE "SessionContextRole" AS ENUM ('user', 'assistant', 'system');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "ChatflowSummaryType" AS ENUM ('session_summary', 'persistent', 'insight');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "ChatflowSummaryTrigger" AS ENUM ('agent_switch', 'session_completed', 'manual');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "UserProfileType" AS ENUM ('asset_radar', 'personality', 'ikigai', 'business_status');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ============================================
-- Phase 1.4 —— Table: SessionContextEntry（Layer A 滑动窗口）
-- ============================================
CREATE TABLE IF NOT EXISTS "SessionContextEntry" (
  "id"              BIGSERIAL             PRIMARY KEY,
  "userId"          VARCHAR(64)           NOT NULL,
  "role"            "SessionContextRole"  NOT NULL,
  "content"         TEXT                  NOT NULL,
  "agentKey"        VARCHAR(32),
  "chatflowId"      VARCHAR(128),
  "sourceMessageId" VARCHAR(128),
  "expiresAt"       TIMESTAMP(3)          NOT NULL,
  "createdAt"       TIMESTAMP(3)          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SessionContextEntry_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "SessionContextEntry_userId_expiresAt_createdAt_idx"
  ON "SessionContextEntry" ("userId", "expiresAt", "createdAt");

-- ============================================
-- Phase 1.5 —— Table: ChatflowSummary（Layer C 历史摘要）
-- ============================================
CREATE TABLE IF NOT EXISTS "ChatflowSummary" (
  "id"               BIGSERIAL                 PRIMARY KEY,
  "userId"           VARCHAR(64)               NOT NULL,
  "memoryType"       "ChatflowSummaryType"     NOT NULL DEFAULT 'session_summary',
  "trigger"          "ChatflowSummaryTrigger"  NOT NULL,
  "content"          TEXT                      NOT NULL,
  "relevanceTags"    TEXT[]                    NOT NULL DEFAULT '{}',
  "sourceAgentKey"   VARCHAR(32),
  "sourceChatflowId" VARCHAR(128),
  "sourceRangeStart" TIMESTAMP(3),
  "sourceRangeEnd"   TIMESTAMP(3),
  "createdAt"        TIMESTAMP(3)              NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChatflowSummary_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "ChatflowSummary_userId_memoryType_createdAt_idx"
  ON "ChatflowSummary" ("userId", "memoryType", "createdAt");

CREATE INDEX IF NOT EXISTS "ChatflowSummary_userId_sourceAgentKey_createdAt_idx"
  ON "ChatflowSummary" ("userId", "sourceAgentKey", "createdAt");

-- ============================================
-- Phase 1.6 —— Table: UserProfile（L3 聚合画像）
-- ============================================
CREATE TABLE IF NOT EXISTS "UserProfile" (
  "id"              BIGSERIAL          PRIMARY KEY,
  "userId"          VARCHAR(64)        NOT NULL,
  "profileType"     "UserProfileType"  NOT NULL,
  "profileData"     JSONB              NOT NULL,
  "sourceFactCount" INTEGER            NOT NULL DEFAULT 0,
  "isCurrent"       BOOLEAN            NOT NULL DEFAULT true,
  "version"         INTEGER            NOT NULL DEFAULT 1,
  "generatedAt"     TIMESTAMP(3)       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserProfile_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "UserProfile_userId_profileType_version_key"
  ON "UserProfile" ("userId", "profileType", "version");

CREATE INDEX IF NOT EXISTS "UserProfile_userId_profileType_isCurrent_idx"
  ON "UserProfile" ("userId", "profileType", "isCurrent");
