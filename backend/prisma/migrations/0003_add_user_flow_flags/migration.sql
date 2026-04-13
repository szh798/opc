-- Phase 2 —— User 业务流转状态字段
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "lastIncompleteFlow"       VARCHAR(64),
  ADD COLUMN IF NOT EXISTS "lastIncompleteStep"       VARCHAR(64),
  ADD COLUMN IF NOT EXISTS "hasAssetRadar"            BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "hasOpportunityScores"     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "hasSelectedDirection"     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "hasBusinessHealth"        BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "hasProductStructure"      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "hasPricingCard"           BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "activeChatflowId"         VARCHAR(64),
  ADD COLUMN IF NOT EXISTS "activeDifyConversationId" VARCHAR(128);
