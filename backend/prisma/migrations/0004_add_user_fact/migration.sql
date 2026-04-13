-- Phase 1.1 —— 新增 L1 用户事实表 UserFact
-- 对应 abundant-forging-papert.md §3.4 的 user_facts 设计
-- 本迁移不触碰现有 "MemoryEntry"，保证可独立回滚。

-- ============================================
-- Enums
-- ============================================
DO $$ BEGIN
  CREATE TYPE "UserFactCategory" AS ENUM (
    'skill',
    'resource',
    'cognition',
    'relationship',
    'experience',
    'personality',
    'preference',
    'pain_point',
    'goal',
    'business',
    'behavior'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "UserFactDimension" AS ENUM (
    'capability',
    'resource',
    'cognition',
    'relationship'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "UserFactSource" AS ENUM (
    'llm_realtime',
    'llm_batch',
    'user_explicit',
    'system_infer',
    'legacy'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ============================================
-- Table: UserFact
-- ============================================
CREATE TABLE IF NOT EXISTS "UserFact" (
  "id"               BIGSERIAL            PRIMARY KEY,
  "userId"           VARCHAR(64)          NOT NULL,
  "category"         "UserFactCategory"   NOT NULL,
  "dimension"        "UserFactDimension",
  "factKey"          VARCHAR(128)         NOT NULL,
  "factValue"        TEXT                 NOT NULL,
  "confidence"       DOUBLE PRECISION     NOT NULL DEFAULT 1,
  "sourceMessageId"  VARCHAR(128),
  "sourceChatflowId" VARCHAR(128),
  "extractedBy"      "UserFactSource"     NOT NULL DEFAULT 'llm_realtime',
  "isActive"         BOOLEAN              NOT NULL DEFAULT true,
  "version"          INTEGER              NOT NULL DEFAULT 1,
  "createdAt"        TIMESTAMP(3)         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3)         NOT NULL,
  CONSTRAINT "UserFact_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- 同一 (userId, category, factKey) 的不同 version 互不冲突；
-- 新版写入时旧版应被置 isActive=false（由应用层保证）。
CREATE UNIQUE INDEX IF NOT EXISTS "UserFact_userId_category_factKey_version_key"
  ON "UserFact" ("userId", "category", "factKey", "version");

CREATE INDEX IF NOT EXISTS "UserFact_userId_category_isActive_updatedAt_idx"
  ON "UserFact" ("userId", "category", "isActive", "updatedAt");

CREATE INDEX IF NOT EXISTS "UserFact_userId_dimension_isActive_idx"
  ON "UserFact" ("userId", "dimension", "isActive");
