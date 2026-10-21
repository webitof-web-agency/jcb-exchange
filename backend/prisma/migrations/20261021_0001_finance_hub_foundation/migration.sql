-- Finance Hub (Financial Reports & CA Workspace) foundation: settings/kill switch,
-- finance audit log and posting queue. New tables only; no existing table is altered.
-- CreateEnum
CREATE TYPE "FinPostingMode" AS ENUM ('OFF', 'SHADOW', 'LIVE');

-- CreateEnum
CREATE TYPE "FinQueueStatus" AS ENUM ('PENDING', 'PROCESSING', 'DONE', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "FinSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "postingMode" "FinPostingMode" NOT NULL DEFAULT 'OFF',
    "baseCurrency" VARCHAR(3) NOT NULL DEFAULT 'INR',
    "booksBeginDate" DATE,
    "cashLimitPerVoucher" DECIMAL(14,2),
    "cashReceiptLimit" DECIMAL(14,2),
    "config" JSONB,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinAuditLog" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT,
    "entityType" VARCHAR(60) NOT NULL,
    "entityId" VARCHAR(100) NOT NULL,
    "action" VARCHAR(40) NOT NULL,
    "beforeJson" JSONB,
    "afterJson" JSONB,
    "reason" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinPostingQueue" (
    "id" TEXT NOT NULL,
    "sourceType" VARCHAR(40) NOT NULL,
    "sourceId" VARCHAR(100) NOT NULL,
    "event" VARCHAR(60) NOT NULL,
    "status" "FinQueueStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextRunAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,
    "resultVoucherIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinPostingQueue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FinAuditLog_entityType_entityId_idx" ON "FinAuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "FinAuditLog_actorUserId_createdAt_idx" ON "FinAuditLog"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "FinAuditLog_createdAt_idx" ON "FinAuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "FinPostingQueue_status_nextRunAt_idx" ON "FinPostingQueue"("status", "nextRunAt");

-- CreateIndex
CREATE INDEX "FinPostingQueue_sourceType_sourceId_idx" ON "FinPostingQueue"("sourceType", "sourceId");
