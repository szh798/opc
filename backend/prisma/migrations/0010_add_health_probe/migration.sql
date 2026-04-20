-- Phase B4: readiness 探针表
CREATE TABLE "HealthProbe" (
  "id" VARCHAR(32) PRIMARY KEY,
  "probedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "probeCount" INT NOT NULL DEFAULT 0
);
