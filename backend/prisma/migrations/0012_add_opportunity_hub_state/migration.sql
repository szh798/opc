ALTER TABLE "Project"
ADD COLUMN "opportunityStage" VARCHAR(32),
ADD COLUMN "decisionStatus" VARCHAR(32),
ADD COLUMN "nextValidationAction" TEXT,
ADD COLUMN "nextValidationActionAt" TIMESTAMPTZ,
ADD COLUMN "lastValidationSignal" TEXT,
ADD COLUMN "lastValidationAt" TIMESTAMPTZ,
ADD COLUMN "opportunityScore" JSONB,
ADD COLUMN "opportunitySnapshot" JSONB,
ADD COLUMN "isFocusOpportunity" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "Project_userId_isFocusOpportunity_deletedAt_idx"
ON "Project"("userId", "isFocusOpportunity", "deletedAt");

ALTER TABLE "ProjectArtifact"
ADD COLUMN "versionScope" VARCHAR(32) NOT NULL DEFAULT 'current';

CREATE INDEX "ProjectArtifact_projectId_type_versionScope_deletedAt_idx"
ON "ProjectArtifact"("projectId", "type", "versionScope", "deletedAt");
