CREATE TYPE "RcMobileNumberCheckStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED');

CREATE TABLE "RcMobileNumberCheckRecord" (
    "id" TEXT NOT NULL,
    "status" "RcMobileNumberCheckStatus" NOT NULL DEFAULT 'PENDING',
    "maskedRcNumber" TEXT NOT NULL,
    "maskedMobileNumber" TEXT NOT NULL,
    "requestFingerprint" VARCHAR(64) NOT NULL,
    "isMobileNumberMatch" BOOLEAN,
    "provider" TEXT NOT NULL DEFAULT 'SUREPASS',
    "providerClientId" TEXT,
    "messageCode" TEXT,
    "safeMessage" TEXT,
    "encryptedResult" TEXT,
    "requestedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "RcMobileNumberCheckRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RcMobileNumberCheckRecord_status_createdAt_idx"
ON "RcMobileNumberCheckRecord"("status", "createdAt");
CREATE INDEX "RcMobileNumberCheckRecord_requestedById_createdAt_idx"
ON "RcMobileNumberCheckRecord"("requestedById", "createdAt");
CREATE INDEX "RcMobileNumberCheckRecord_maskedRcNumber_createdAt_idx"
ON "RcMobileNumberCheckRecord"("maskedRcNumber", "createdAt");
CREATE INDEX "RcMobileNumberCheckRecord_maskedMobileNumber_createdAt_idx"
ON "RcMobileNumberCheckRecord"("maskedMobileNumber", "createdAt");
CREATE INDEX "RcMobileNumberCheckRecord_requestFingerprint_status_completedAt_idx"
ON "RcMobileNumberCheckRecord"("requestFingerprint", "status", "completedAt");
CREATE UNIQUE INDEX "RcMobileNumberCheckRecord_requestFingerprint_key"
ON "RcMobileNumberCheckRecord"("requestFingerprint");

ALTER TABLE "RcMobileNumberCheckRecord"
ADD CONSTRAINT "RcMobileNumberCheckRecord_requestedById_fkey"
FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TYPE "AuditEntityType" ADD VALUE 'RC_MOBILE_NUMBER_CHECK';
