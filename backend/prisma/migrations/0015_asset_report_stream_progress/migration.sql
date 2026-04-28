ALTER TABLE "StreamEvent"
ADD COLUMN IF NOT EXISTS "sessionId" VARCHAR(128),
ADD COLUMN IF NOT EXISTS "messageId" VARCHAR(128),
ADD COLUMN IF NOT EXISTS "cardId" VARCHAR(128),
ADD COLUMN IF NOT EXISTS "generationJobId" VARCHAR(128),
ADD COLUMN IF NOT EXISTS "clientMessageId" VARCHAR(128);

CREATE INDEX IF NOT EXISTS "StreamEvent_streamId_eventIndex_idx" ON "StreamEvent"("streamId", "eventIndex");
CREATE INDEX IF NOT EXISTS "StreamEvent_generationJobId_eventIndex_idx" ON "StreamEvent"("generationJobId", "eventIndex");
CREATE INDEX IF NOT EXISTS "StreamEvent_clientMessageId_idx" ON "StreamEvent"("clientMessageId");

CREATE TABLE IF NOT EXISTS "GenerationJob" (
  "id" TEXT NOT NULL,
  "userId" VARCHAR(64) NOT NULL,
  "chatflowSessionId" VARCHAR(128),
  "jobType" VARCHAR(32) NOT NULL,
  "status" VARCHAR(16) NOT NULL DEFAULT 'running',
  "currentStep" VARCHAR(64),
  "progress" INTEGER NOT NULL DEFAULT 0,
  "steps" JSONB NOT NULL DEFAULT '[]',
  "partialData" JSONB NOT NULL DEFAULT '{}',
  "result" JSONB NOT NULL DEFAULT '{}',
  "error" JSONB NOT NULL DEFAULT '{}',
  "artifactId" VARCHAR(128),
  "assistantMessageId" VARCHAR(128),
  "streamId" VARCHAR(128),
  "clientMessageId" VARCHAR(128),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "GenerationJob_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'GenerationJob_userId_fkey'
      AND table_name = 'GenerationJob'
  ) THEN
    ALTER TABLE "GenerationJob"
    ADD CONSTRAINT "GenerationJob_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "GenerationJob_userId_jobType_status_createdAt_idx"
ON "GenerationJob"("userId", "jobType", "status", "createdAt");

CREATE INDEX IF NOT EXISTS "GenerationJob_chatflowSessionId_jobType_status_idx"
ON "GenerationJob"("chatflowSessionId", "jobType", "status");

CREATE INDEX IF NOT EXISTS "GenerationJob_streamId_idx"
ON "GenerationJob"("streamId");
