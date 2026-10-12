CREATE TYPE "GstVerificationStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED');

CREATE TABLE "GstVerificationRecord" (
  "id" TEXT NOT NULL,
  "status" "GstVerificationStatus" NOT NULL DEFAULT 'PENDING',
  "maskedGstin" TEXT NOT NULL,
  "gstinStatus" TEXT,
  "businessName" TEXT,
  "legalName" TEXT,
  "provider" TEXT NOT NULL DEFAULT 'SUREPASS',
  "providerClientId" TEXT,
  "messageCode" TEXT,
  "safeMessage" TEXT,
  "encryptedResult" TEXT,
  "requestedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "GstVerificationRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "GstVerificationRecord_status_createdAt_idx" ON "GstVerificationRecord"("status", "createdAt");
CREATE INDEX "GstVerificationRecord_requestedById_createdAt_idx" ON "GstVerificationRecord"("requestedById", "createdAt");
CREATE INDEX "GstVerificationRecord_maskedGstin_createdAt_idx" ON "GstVerificationRecord"("maskedGstin", "createdAt");
CREATE INDEX "GstVerificationRecord_gstinStatus_createdAt_idx" ON "GstVerificationRecord"("gstinStatus", "createdAt");

ALTER TABLE "GstVerificationRecord"
  ADD CONSTRAINT "GstVerificationRecord_requestedById_fkey"
  FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
