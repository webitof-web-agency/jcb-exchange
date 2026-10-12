CREATE TYPE "ChassisToRcVerificationStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED');

CREATE TABLE "ChassisToRcVerificationRecord" (
    "id" TEXT NOT NULL,
    "status" "ChassisToRcVerificationStatus" NOT NULL DEFAULT 'PENDING',
    "maskedChassisNumber" TEXT NOT NULL,
    "requestFingerprint" VARCHAR(64),
    "rcNumber" TEXT,
    "ownerName" TEXT,
    "rcStatus" TEXT,
    "vehicleCategory" TEXT,
    "registrationDate" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'SUREPASS',
    "providerClientId" TEXT,
    "messageCode" TEXT,
    "safeMessage" TEXT,
    "encryptedResult" TEXT,
    "requestedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ChassisToRcVerificationRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ChassisToRcVerificationRecord_status_createdAt_idx"
ON "ChassisToRcVerificationRecord"("status", "createdAt");
CREATE INDEX "ChassisToRcVerificationRecord_requestedById_createdAt_idx"
ON "ChassisToRcVerificationRecord"("requestedById", "createdAt");
CREATE INDEX "ChassisToRcVerificationRecord_maskedChassisNumber_createdAt_idx"
ON "ChassisToRcVerificationRecord"("maskedChassisNumber", "createdAt");
CREATE INDEX "ChassisToRcVerificationRecord_rcNumber_createdAt_idx"
ON "ChassisToRcVerificationRecord"("rcNumber", "createdAt");
CREATE INDEX "ChassisToRcVerificationRecord_requestFingerprint_status_completedAt_idx"
ON "ChassisToRcVerificationRecord"("requestFingerprint", "status", "completedAt");
ALTER TABLE "ChassisToRcVerificationRecord"
ADD CONSTRAINT "ChassisToRcVerificationRecord_requestedById_fkey"
FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TYPE "AuditEntityType" ADD VALUE 'CHASSIS_TO_RC_VERIFICATION';
