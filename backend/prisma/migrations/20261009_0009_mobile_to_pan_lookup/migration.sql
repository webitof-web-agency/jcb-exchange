CREATE TYPE "MobileToPanLookupStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED');

CREATE TABLE "MobileToPanLookupRecord" (
  "id" TEXT NOT NULL,
  "status" "MobileToPanLookupStatus" NOT NULL DEFAULT 'PENDING',
  "maskedName" TEXT NOT NULL,
  "maskedMobileNumber" TEXT NOT NULL,
  "requestFingerprint" VARCHAR(64) NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'SUREPASS',
  "providerClientId" TEXT,
  "messageCode" TEXT,
  "safeMessage" TEXT,
  "encryptedResult" TEXT,
  "requestedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),

  CONSTRAINT "MobileToPanLookupRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MobileToPanLookupRecord_requestFingerprint_key"
  ON "MobileToPanLookupRecord"("requestFingerprint");
CREATE INDEX "MobileToPanLookupRecord_status_createdAt_idx"
  ON "MobileToPanLookupRecord"("status", "createdAt");
CREATE INDEX "MobileToPanLookupRecord_requestedById_createdAt_idx"
  ON "MobileToPanLookupRecord"("requestedById", "createdAt");
CREATE INDEX "MobileToPanLookupRecord_maskedName_createdAt_idx"
  ON "MobileToPanLookupRecord"("maskedName", "createdAt");
CREATE INDEX "MobileToPanLookupRecord_maskedMobileNumber_createdAt_idx"
  ON "MobileToPanLookupRecord"("maskedMobileNumber", "createdAt");
CREATE INDEX "MobileToPanLookupRecord_requestFingerprint_status_completedAt_idx"
  ON "MobileToPanLookupRecord"("requestFingerprint", "status", "completedAt");

ALTER TABLE "MobileToPanLookupRecord"
  ADD CONSTRAINT "MobileToPanLookupRecord_requestedById_fkey"
  FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TYPE "AuditEntityType" ADD VALUE 'MOBILE_TO_PAN_LOOKUP';
