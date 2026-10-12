CREATE TYPE "RcChallanVerificationStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED');

CREATE TABLE "RcChallanVerificationRecord" (
    "id" TEXT NOT NULL,
    "status" "RcChallanVerificationStatus" NOT NULL DEFAULT 'PENDING',
    "maskedRcNumber" TEXT NOT NULL,
    "requestFingerprint" VARCHAR(64) NOT NULL,
    "totalChallans" INTEGER NOT NULL DEFAULT 0,
    "knownPendingCount" INTEGER NOT NULL DEFAULT 0,
    "totalReturnedAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "knownPendingAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "courtChallanCount" INTEGER NOT NULL DEFAULT 0,
    "blacklistCount" INTEGER NOT NULL DEFAULT 0,
    "provider" TEXT NOT NULL DEFAULT 'SUREPASS',
    "providerEnvironment" TEXT,
    "providerClientId" TEXT,
    "messageCode" TEXT,
    "safeMessage" TEXT,
    "encryptedResult" TEXT,
    "requestedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "RcChallanVerificationRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RcChallanVerificationRecord_status_createdAt_idx"
ON "RcChallanVerificationRecord"("status", "createdAt");
CREATE INDEX "RcChallanVerificationRecord_requestedById_createdAt_idx"
ON "RcChallanVerificationRecord"("requestedById", "createdAt");
CREATE INDEX "RcChallanVerificationRecord_maskedRcNumber_createdAt_idx"
ON "RcChallanVerificationRecord"("maskedRcNumber", "createdAt");
CREATE INDEX "RcChallanVerificationRecord_requestedById_requestFingerprint_createdAt_idx"
ON "RcChallanVerificationRecord"("requestedById", "requestFingerprint", "createdAt");

ALTER TABLE "RcChallanVerificationRecord"
ADD CONSTRAINT "RcChallanVerificationRecord_requestedById_fkey"
FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TYPE "AuditEntityType" ADD VALUE 'RC_CHALLAN_VERIFICATION';
