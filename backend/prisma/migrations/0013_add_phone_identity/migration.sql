-- Phase A6: phone login identity mapping
CREATE TABLE "PhoneIdentity" (
  "id" TEXT PRIMARY KEY,
  "userId" VARCHAR(64) NOT NULL,
  "phoneHash" VARCHAR(128) NOT NULL,
  "phoneMasked" VARCHAR(32) NOT NULL,
  "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "PhoneIdentity_phoneHash_key"
  ON "PhoneIdentity"("phoneHash");

CREATE INDEX "PhoneIdentity_userId_idx"
  ON "PhoneIdentity"("userId");

ALTER TABLE "PhoneIdentity"
ADD CONSTRAINT "PhoneIdentity_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
