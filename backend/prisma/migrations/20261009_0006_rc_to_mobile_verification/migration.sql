CREATE TYPE "RcToMobileVerificationStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED');

CREATE TABLE "RcToMobileVerificationRecord" (
    "id" TEXT NOT NULL,
    "status" "RcToMobileVerificationStatus" NOT NULL DEFAULT 'PENDING',
    "maskedRcNumber" TEXT NOT NULL,
    "requestFingerprint" VARCHAR(64) NOT NULL,
    "maskedMobileNumber" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'SUREPASS',
    "providerClientId" TEXT,
    "messageCode" TEXT,
    "safeMessage" TEXT,
    "encryptedResult" TEXT,
    "requestedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "RcToMobileVerificationRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RcToMobileVerificationRecord_status_createdAt_idx"
ON "RcToMobileVerificationRecord"("status", "createdAt");
CREATE INDEX "RcToMobileVerificationRecord_requestedById_createdAt_idx"
ON "RcToMobileVerificationRecord"("requestedById", "createdAt");
CREATE INDEX "RcToMobileVerificationRecord_maskedRcNumber_createdAt_idx"
ON "RcToMobileVerificationRecord"("maskedRcNumber", "createdAt");
CREATE INDEX "RcToMobileVerificationRecord_requestFingerprint_status_completedAt_idx"
ON "RcToMobileVerificationRecord"("requestFingerprint", "status", "completedAt");
CREATE UNIQUE INDEX "RcToMobileVerificationRecord_requestFingerprint_key"
ON "RcToMobileVerificationRecord"("requestFingerprint");

ALTER TABLE "RcToMobileVerificationRecord"
ADD CONSTRAINT "RcToMobileVerificationRecord_requestedById_fkey"
FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TYPE "AuditEntityType" ADD VALUE 'RC_TO_MOBILE_VERIFICATION';
