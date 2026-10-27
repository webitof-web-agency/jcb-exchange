ALTER TYPE "ApiBillableService" ADD VALUE IF NOT EXISTS 'AADHAAR_DIGILOCKER';

CREATE TYPE "AadhaarVerificationStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED');
CREATE TYPE "AadhaarVerificationSide" AS ENUM ('PURCHASE', 'SALE');

CREATE TABLE "AadhaarVerificationRecord" (
  "id" TEXT NOT NULL,
  "status" "AadhaarVerificationStatus" NOT NULL DEFAULT 'PENDING',
  "side" "AadhaarVerificationSide" NOT NULL,
  "maskedAadhaar" TEXT NOT NULL,
  "requestFingerprint" VARCHAR(64) NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'SUREPASS',
  "providerClientId" TEXT,
  "messageCode" TEXT,
  "safeMessage" TEXT,
  "encryptedResult" TEXT,
  "requestedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "AadhaarVerificationRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AadhaarVerificationRecord_status_createdAt_idx" ON "AadhaarVerificationRecord"("status", "createdAt");
CREATE INDEX "AadhaarVerificationRecord_side_status_createdAt_idx" ON "AadhaarVerificationRecord"("side", "status", "createdAt");
CREATE INDEX "AadhaarVerificationRecord_requestedById_createdAt_idx" ON "AadhaarVerificationRecord"("requestedById", "createdAt");
CREATE INDEX "AadhaarVerificationRecord_maskedAadhaar_createdAt_idx" ON "AadhaarVerificationRecord"("maskedAadhaar", "createdAt");
CREATE INDEX "AadhaarVerificationRecord_requestFingerprint_status_completedAt_idx" ON "AadhaarVerificationRecord"("requestFingerprint", "status", "completedAt");

ALTER TABLE "AadhaarVerificationRecord"
  ADD CONSTRAINT "AadhaarVerificationRecord_requestedById_fkey"
  FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
