CREATE TABLE IF NOT EXISTS "PolicyItem" (
  "id" VARCHAR(128) NOT NULL,
  "region" VARCHAR(120) NOT NULL,
  "province" VARCHAR(80),
  "city" VARCHAR(80),
  "district" VARCHAR(80),
  "title" VARCHAR(300) NOT NULL,
  "summary" TEXT,
  "status" VARCHAR(32) NOT NULL,
  "fineTags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "sourceDate" TIMESTAMP(3),
  "lastVerifiedAt" TIMESTAMP(3),
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "priority" INTEGER NOT NULL DEFAULT 0,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PolicyItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PolicySource" (
  "id" TEXT NOT NULL,
  "policyId" VARCHAR(128) NOT NULL,
  "sourceKey" VARCHAR(40) NOT NULL,
  "type" VARCHAR(32) NOT NULL,
  "label" VARCHAR(160) NOT NULL,
  "url" TEXT NOT NULL,
  "note" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PolicySource_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PolicySource_policyId_sourceKey_key"
ON "PolicySource"("policyId", "sourceKey");

CREATE INDEX IF NOT EXISTS "PolicyItem_status_idx" ON "PolicyItem"("status");
CREATE INDEX IF NOT EXISTS "PolicyItem_region_idx" ON "PolicyItem"("region");
CREATE INDEX IF NOT EXISTS "PolicyItem_city_idx" ON "PolicyItem"("city");
CREATE INDEX IF NOT EXISTS "PolicyItem_isActive_idx" ON "PolicyItem"("isActive");
CREATE INDEX IF NOT EXISTS "PolicySource_policyId_idx" ON "PolicySource"("policyId");
CREATE INDEX IF NOT EXISTS "PolicySource_type_idx" ON "PolicySource"("type");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'PolicySource_policyId_fkey'
      AND table_name = 'PolicySource'
  ) THEN
    ALTER TABLE "PolicySource"
    ADD CONSTRAINT "PolicySource_policyId_fkey"
    FOREIGN KEY ("policyId") REFERENCES "PolicyItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
