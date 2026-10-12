CREATE TYPE "RcOwnerHistoryStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED');

CREATE TABLE "RcOwnerHistoryRecord" (
    "id" TEXT NOT NULL,
    "status" "RcOwnerHistoryStatus" NOT NULL DEFAULT 'PENDING',
    "maskedRcNumber" TEXT NOT NULL,
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

    CONSTRAINT "RcOwnerHistoryRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RcOwnerHistoryRecord_status_createdAt_idx"
ON "RcOwnerHistoryRecord"("status", "createdAt");
CREATE INDEX "RcOwnerHistoryRecord_requestedById_createdAt_idx"
ON "RcOwnerHistoryRecord"("requestedById", "createdAt");
CREATE INDEX "RcOwnerHistoryRecord_maskedRcNumber_createdAt_idx"
ON "RcOwnerHistoryRecord"("maskedRcNumber", "createdAt");
CREATE INDEX "RcOwnerHistoryRecord_rcStatus_createdAt_idx"
ON "RcOwnerHistoryRecord"("rcStatus", "createdAt");

ALTER TABLE "RcOwnerHistoryRecord"
ADD CONSTRAINT "RcOwnerHistoryRecord_requestedById_fkey"
FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TYPE "AuditEntityType" ADD VALUE 'RC_OWNER_HISTORY';
