-- Phase A5: SMS verification code storage
CREATE TABLE "SmsVerificationCode" (
  "id" TEXT PRIMARY KEY,
  "phoneHash" VARCHAR(128) NOT NULL,
  "phoneMasked" VARCHAR(32) NOT NULL,
  "purpose" VARCHAR(32) NOT NULL DEFAULT 'login',
  "codeHash" VARCHAR(128) NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "sendStatus" VARCHAR(24) NOT NULL DEFAULT 'pending',
  "provider" VARCHAR(32) NOT NULL DEFAULT 'aliyun',
  "providerBizId" VARCHAR(128),
  "providerRequestId" VARCHAR(128),
  "providerCode" VARCHAR(64),
  "providerMessage" VARCHAR(512),
  "requestIp" VARCHAR(128),
  "userAgent" VARCHAR(512),
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "SmsVerificationCode_phoneHash_purpose_createdAt_idx"
  ON "SmsVerificationCode"("phoneHash", "purpose", "createdAt");

CREATE INDEX "SmsVerificationCode_phoneHash_purpose_expiresAt_idx"
  ON "SmsVerificationCode"("phoneHash", "purpose", "expiresAt");

CREATE INDEX "SmsVerificationCode_sendStatus_createdAt_idx"
  ON "SmsVerificationCode"("sendStatus", "createdAt");
