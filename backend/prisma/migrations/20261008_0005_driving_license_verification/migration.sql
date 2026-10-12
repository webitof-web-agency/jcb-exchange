-- Add optional customer-id support to the shared encrypted Surepass settings.
ALTER TABLE "PanVerificationSettings"
ADD COLUMN "encryptedCustomerId" TEXT;

-- Store minimal searchable history and keep the normalized sensitive result encrypted.
CREATE TYPE "DrivingLicenseVerificationStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED');

CREATE TABLE "DrivingLicenseVerificationRecord" (
    "id" TEXT NOT NULL,
    "status" "DrivingLicenseVerificationStatus" NOT NULL DEFAULT 'PENDING',
    "maskedLicenseNumber" TEXT NOT NULL,
    "currentStatus" TEXT,
    "state" TEXT,
    "holderName" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'SUREPASS',
    "providerClientId" TEXT,
    "messageCode" TEXT,
    "safeMessage" TEXT,
    "encryptedResult" TEXT,
    "requestedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "DrivingLicenseVerificationRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DrivingLicenseVerificationRecord_status_createdAt_idx"
ON "DrivingLicenseVerificationRecord"("status", "createdAt");
CREATE INDEX "DrivingLicenseVerificationRecord_requestedById_createdAt_idx"
ON "DrivingLicenseVerificationRecord"("requestedById", "createdAt");
CREATE INDEX "DrivingLicenseVerificationRecord_maskedLicenseNumber_createdAt_idx"
ON "DrivingLicenseVerificationRecord"("maskedLicenseNumber", "createdAt");
CREATE INDEX "DrivingLicenseVerificationRecord_currentStatus_createdAt_idx"
ON "DrivingLicenseVerificationRecord"("currentStatus", "createdAt");

ALTER TABLE "DrivingLicenseVerificationRecord"
ADD CONSTRAINT "DrivingLicenseVerificationRecord_requestedById_fkey"
FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TYPE "AuditEntityType" ADD VALUE 'DRIVING_LICENSE_VERIFICATION';
