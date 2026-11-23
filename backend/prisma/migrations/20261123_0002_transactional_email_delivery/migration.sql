-- Phase 2: configurable recruitment email templates and durable delivery queue.
ALTER TABLE "RecruitmentEmailTemplate"
  ADD COLUMN "enabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "attachmentMode" TEXT NOT NULL DEFAULT 'NONE';

ALTER TABLE "Offer"
  ADD COLUMN "responseTokenVersion" INTEGER NOT NULL DEFAULT 1;

UPDATE "RecruitmentEmailTemplate"
SET "attachmentMode" = 'DYNAMIC_OFFER_PDF'
WHERE "code" = 'OFFER_SENT';

CREATE TYPE "EmailMessageStatus" AS ENUM ('QUEUED', 'SENT', 'FAILED', 'SKIPPED');
CREATE TYPE "EmailOutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'CANCELLED');

CREATE TABLE "transactional_email_logs" (
  "id" TEXT NOT NULL,
  "eventCode" TEXT NOT NULL,
  "templateId" TEXT,
  "relatedEntityType" TEXT,
  "relatedEntityId" TEXT,
  "recipientEmail" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "status" "EmailMessageStatus" NOT NULL DEFAULT 'QUEUED',
  "errorMessage" TEXT,
  "payloadSnapshot" JSONB,
  "dedupeKey" TEXT,
  "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "transactional_email_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "transactional_email_outbox" (
  "id" TEXT NOT NULL,
  "emailLogId" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "status" "EmailOutboxStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
  "lockedAt" TIMESTAMP(3),
  "processedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "transactional_email_outbox_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "transactional_email_logs_dedupeKey_key" ON "transactional_email_logs"("dedupeKey");
CREATE INDEX "transactional_email_logs_eventCode_createdAt_idx" ON "transactional_email_logs"("eventCode", "createdAt");
CREATE INDEX "transactional_email_logs_relatedEntityType_relatedEntityId_idx" ON "transactional_email_logs"("relatedEntityType", "relatedEntityId");
CREATE INDEX "transactional_email_logs_recipientEmail_status_createdAt_idx" ON "transactional_email_logs"("recipientEmail", "status", "createdAt");
CREATE UNIQUE INDEX "transactional_email_outbox_emailLogId_key" ON "transactional_email_outbox"("emailLogId");
CREATE INDEX "transactional_email_outbox_status_nextAttemptAt_idx" ON "transactional_email_outbox"("status", "nextAttemptAt");

ALTER TABLE "transactional_email_logs"
  ADD CONSTRAINT "transactional_email_logs_templateId_fkey"
  FOREIGN KEY ("templateId") REFERENCES "RecruitmentEmailTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "transactional_email_outbox"
  ADD CONSTRAINT "transactional_email_outbox_emailLogId_fkey"
  FOREIGN KEY ("emailLogId") REFERENCES "transactional_email_logs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
