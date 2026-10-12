CREATE TYPE "MobileToRcLookupStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED');

CREATE TABLE "MobileToRcLookupRecord" (
    "id" TEXT NOT NULL,
    "status" "MobileToRcLookupStatus" NOT NULL DEFAULT 'PENDING',
    "maskedMobileNumber" TEXT NOT NULL,
    "requestFingerprint" VARCHAR(64) NOT NULL,
    "rcNumbersCount" INTEGER NOT NULL DEFAULT 0,
    "provider" TEXT NOT NULL DEFAULT 'SUREPASS',
    "providerClientId" TEXT,
    "messageCode" TEXT,
    "safeMessage" TEXT,
    "encryptedResult" TEXT,
    "requestedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "MobileToRcLookupRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MobileToRcLookupRecord_status_createdAt_idx"
ON "MobileToRcLookupRecord"("status", "createdAt");
CREATE INDEX "MobileToRcLookupRecord_requestedById_createdAt_idx"
ON "MobileToRcLookupRecord"("requestedById", "createdAt");
CREATE INDEX "MobileToRcLookupRecord_maskedMobileNumber_createdAt_idx"
ON "MobileToRcLookupRecord"("maskedMobileNumber", "createdAt");
CREATE INDEX "MobileToRcLookupRecord_requestFingerprint_status_completedAt_idx"
ON "MobileToRcLookupRecord"("requestFingerprint", "status", "completedAt");
CREATE UNIQUE INDEX "MobileToRcLookupRecord_requestFingerprint_key"
ON "MobileToRcLookupRecord"("requestFingerprint");

ALTER TABLE "MobileToRcLookupRecord"
ADD CONSTRAINT "MobileToRcLookupRecord_requestedById_fkey"
FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TYPE "AuditEntityType" ADD VALUE 'MOBILE_TO_RC_LOOKUP';
