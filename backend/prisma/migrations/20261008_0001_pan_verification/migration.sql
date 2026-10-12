CREATE TYPE "PanVerificationOperation" AS ENUM ('PAN_VERIFY', 'PAN_TO_AADHAAR', 'PAN_CONTACT_LOOKUP');
CREATE TYPE "PanVerificationStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED');

CREATE TABLE "PanVerificationRecord" (
  "id" TEXT NOT NULL,
  "operation" "PanVerificationOperation" NOT NULL,
  "status" "PanVerificationStatus" NOT NULL DEFAULT 'PENDING',
  "maskedPan" TEXT NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'SUREPASS',
  "providerClientId" TEXT,
  "messageCode" TEXT,
  "safeMessage" TEXT,
  "encryptedResult" TEXT,
  "requestedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "PanVerificationRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PanVerificationRecord_operation_createdAt_idx" ON "PanVerificationRecord"("operation", "createdAt");
CREATE INDEX "PanVerificationRecord_status_createdAt_idx" ON "PanVerificationRecord"("status", "createdAt");
CREATE INDEX "PanVerificationRecord_requestedById_createdAt_idx" ON "PanVerificationRecord"("requestedById", "createdAt");
CREATE INDEX "PanVerificationRecord_maskedPan_createdAt_idx" ON "PanVerificationRecord"("maskedPan", "createdAt");

ALTER TABLE "PanVerificationRecord"
  ADD CONSTRAINT "PanVerificationRecord_requestedById_fkey"
  FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
