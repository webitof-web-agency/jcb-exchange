-- CRM foundation (docs/crm/00_CRM_PLAN.md): additive only — new enums/values, Lead CRM columns, Crm* tables.
-- CreateEnum
CREATE TYPE "CrmLeadType" AS ENUM ('BUY', 'SELL', 'FINANCE', 'INSURANCE', 'RTO', 'TRANSPORT', 'DEALER_ONBOARDING', 'PRIME', 'VERIFICATION', 'OTHER');

-- CreateEnum
CREATE TYPE "CrmPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "CrmTemperature" AS ENUM ('HOT', 'WARM', 'COLD');

-- CreateEnum
CREATE TYPE "CrmLifecycle" AS ENUM ('LEAD', 'PROSPECT', 'CUSTOMER', 'INACTIVE');

-- CreateEnum
CREATE TYPE "CrmFollowUpType" AS ENUM ('CALL', 'WHATSAPP', 'SMS', 'VISIT', 'INSPECTION', 'MEETING', 'EMAIL', 'PAYMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "CrmFollowUpStatus" AS ENUM ('PENDING', 'DONE', 'MISSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CrmFollowUpOutcome" AS ENUM ('CONNECTED', 'NOT_REACHABLE', 'BUSY', 'SWITCHED_OFF', 'CALL_BACK_LATER', 'INTERESTED', 'NOT_INTERESTED', 'WRONG_NUMBER', 'VISITED', 'NO_SHOW', 'MESSAGE_SENT', 'OTHER');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "LeadStatus" ADD VALUE 'QUALIFIED';
ALTER TYPE "LeadStatus" ADD VALUE 'NEGOTIATION';
ALTER TYPE "LeadStatus" ADD VALUE 'ON_HOLD';

-- AlterEnum (CRM reminders to staff)
ALTER TYPE "WhatsAppRecipientType" ADD VALUE 'EMPLOYEE';

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "assignedAt" TIMESTAMP(3),
ADD COLUMN     "brandId" TEXT,
ADD COLUMN     "budgetMax" DECIMAL(14,2),
ADD COLUMN     "budgetMin" DECIMAL(14,2),
ADD COLUMN     "categoryId" TEXT,
ADD COLUMN     "closedAt" TIMESTAMP(3),
ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "expectedValue" DECIMAL(14,2),
ADD COLUMN     "firstResponseAt" TIMESTAMP(3),
ADD COLUMN     "lastActivityAt" TIMESTAMP(3),
ADD COLUMN     "lastContactedAt" TIMESTAMP(3),
ADD COLUMN     "lastReengagedAt" TIMESTAMP(3),
ADD COLUMN     "leadType" "CrmLeadType" NOT NULL DEFAULT 'BUY',
ADD COLUMN     "linkedPartnerProfileId" TEXT,
ADD COLUMN     "lostReason" TEXT,
ADD COLUMN     "matchAlertsEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mergedIntoId" TEXT,
ADD COLUMN     "modelId" TEXT,
ADD COLUMN     "nextFollowUpAt" TIMESTAMP(3),
ADD COLUMN     "notifiedListingIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "ownerId" TEXT,
ADD COLUMN     "priority" "CrmPriority" NOT NULL DEFAULT 'MEDIUM',
ADD COLUMN     "requirementCity" TEXT,
ADD COLUMN     "requirementNotes" TEXT,
ADD COLUMN     "requirementState" TEXT,
ADD COLUMN     "score" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "slaBreachedAt" TIMESTAMP(3),
ADD COLUMN     "slaDueAt" TIMESTAMP(3),
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'WEBSITE',
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "temperature" "CrmTemperature" NOT NULL DEFAULT 'WARM',
ADD COLUMN     "wonAmount" DECIMAL(14,2),
ADD COLUMN     "wonSellAccountId" TEXT,
ADD COLUMN     "yearFrom" INTEGER,
ADD COLUMN     "yearTo" INTEGER;

-- CreateTable
CREATE TABLE "CrmContactProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "contactTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "companyName" TEXT,
    "alternatePhone" TEXT,
    "address" TEXT,
    "pinCode" TEXT,
    "gstNumber" TEXT,
    "ownerId" TEXT,
    "source" TEXT,
    "lifecycle" "CrmLifecycle" NOT NULL DEFAULT 'LEAD',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "doNotContact" BOOLEAN NOT NULL DEFAULT false,
    "preferredLanguage" TEXT,
    "preferredChannel" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmContactProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmFollowUp" (
    "id" TEXT NOT NULL,
    "leadId" TEXT,
    "contactUserId" TEXT NOT NULL,
    "ownerId" TEXT,
    "type" "CrmFollowUpType" NOT NULL DEFAULT 'CALL',
    "status" "CrmFollowUpStatus" NOT NULL DEFAULT 'PENDING',
    "dueAt" TIMESTAMP(3) NOT NULL,
    "title" TEXT,
    "notes" TEXT,
    "outcome" "CrmFollowUpOutcome",
    "outcomeNotes" TEXT,
    "completedAt" TIMESTAMP(3),
    "completedById" TEXT,
    "rescheduleCount" INTEGER NOT NULL DEFAULT 0,
    "lastRescheduleReason" TEXT,
    "previousDueAt" TIMESTAMP(3),
    "remindedAt" TIMESTAMP(3),
    "customerRemindedAt" TIMESTAMP(3),
    "missedAt" TIMESTAMP(3),
    "escalatedAt" TIMESTAMP(3),
    "autoCreated" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmFollowUp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmContactActivity" (
    "id" TEXT NOT NULL,
    "contactUserId" TEXT NOT NULL,
    "actorId" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmContactActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmAssignmentRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "conditions" JSONB,
    "strategy" TEXT NOT NULL DEFAULT 'ROUND_ROBIN',
    "assigneeIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "cursor" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmAssignmentRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "config" JSONB NOT NULL DEFAULT '{}',
    "automationState" JSONB,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmSegment" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "filters" JSONB NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmSegment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmImportBatch" (
    "id" TEXT NOT NULL,
    "fileName" TEXT,
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "createdCount" INTEGER NOT NULL DEFAULT 0,
    "duplicateCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "errors" JSONB,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CrmContactProfile_userId_key" ON "CrmContactProfile"("userId");

-- CreateIndex
CREATE INDEX "CrmContactProfile_ownerId_idx" ON "CrmContactProfile"("ownerId");

-- CreateIndex
CREATE INDEX "CrmContactProfile_lifecycle_idx" ON "CrmContactProfile"("lifecycle");

-- CreateIndex
CREATE INDEX "CrmFollowUp_ownerId_status_dueAt_idx" ON "CrmFollowUp"("ownerId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "CrmFollowUp_status_dueAt_idx" ON "CrmFollowUp"("status", "dueAt");

-- CreateIndex
CREATE INDEX "CrmFollowUp_leadId_idx" ON "CrmFollowUp"("leadId");

-- CreateIndex
CREATE INDEX "CrmFollowUp_contactUserId_idx" ON "CrmFollowUp"("contactUserId");

-- CreateIndex
CREATE INDEX "CrmContactActivity_contactUserId_createdAt_idx" ON "CrmContactActivity"("contactUserId", "createdAt");

-- CreateIndex
CREATE INDEX "CrmAssignmentRule_enabled_sortOrder_idx" ON "CrmAssignmentRule"("enabled", "sortOrder");

-- CreateIndex
CREATE INDEX "CrmImportBatch_createdAt_idx" ON "CrmImportBatch"("createdAt");

-- CreateIndex
CREATE INDEX "Lead_ownerId_status_idx" ON "Lead"("ownerId", "status");

-- CreateIndex
CREATE INDEX "Lead_nextFollowUpAt_idx" ON "Lead"("nextFollowUpAt");

-- CreateIndex
CREATE INDEX "Lead_leadType_status_idx" ON "Lead"("leadType", "status");

-- CreateIndex
CREATE INDEX "Lead_createdAt_idx" ON "Lead"("createdAt");

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmContactProfile" ADD CONSTRAINT "CrmContactProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmContactProfile" ADD CONSTRAINT "CrmContactProfile_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmFollowUp" ADD CONSTRAINT "CrmFollowUp_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmFollowUp" ADD CONSTRAINT "CrmFollowUp_contactUserId_fkey" FOREIGN KEY ("contactUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmFollowUp" ADD CONSTRAINT "CrmFollowUp_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmContactActivity" ADD CONSTRAINT "CrmContactActivity_contactUserId_fkey" FOREIGN KEY ("contactUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

