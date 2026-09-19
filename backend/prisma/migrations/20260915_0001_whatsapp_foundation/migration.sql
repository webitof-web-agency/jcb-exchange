-- Phase 1 WhatsApp Cloud API foundation. All tables are additive and automations stay disabled by default.
CREATE TYPE "WhatsAppMessageStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'SKIPPED');
CREATE TYPE "WhatsAppRecipientType" AS ENUM ('CUSTOMER', 'PARTNER', 'SUPER_ADMIN', 'CANDIDATE', 'TEST');
CREATE TYPE "WhatsAppOutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'CANCELLED');

CREATE TABLE "whatsapp_integration_settings" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "graphApiVersion" TEXT NOT NULL DEFAULT 'v23.0',
  "phoneNumberId" TEXT,
  "businessAccountId" TEXT,
  "testRecipientPhone" TEXT,
  "encryptedAccessToken" TEXT,
  "encryptedWebhookVerifyToken" TEXT,
  "encryptedAppSecret" TEXT,
  "updatedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "whatsapp_integration_settings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "whatsapp_meta_templates" (
  "id" TEXT NOT NULL,
  "metaTemplateId" TEXT,
  "name" TEXT NOT NULL,
  "language" TEXT NOT NULL DEFAULT 'en_US',
  "category" TEXT,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "components" JSONB,
  "lastSyncedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "whatsapp_meta_templates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "whatsapp_automation_rules" (
  "id" TEXT NOT NULL,
  "eventCode" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "templateId" TEXT,
  "recipientPolicy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "whatsapp_automation_rules_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "whatsapp_message_logs" (
  "id" TEXT NOT NULL,
  "eventCode" TEXT NOT NULL,
  "relatedEntityType" TEXT,
  "relatedEntityId" TEXT,
  "recipientType" "WhatsAppRecipientType" NOT NULL,
  "recipientPhone" TEXT NOT NULL,
  "status" "WhatsAppMessageStatus" NOT NULL DEFAULT 'QUEUED',
  "metaMessageId" TEXT,
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "payloadSnapshot" JSONB,
  "sentAt" TIMESTAMP(3),
  "deliveredAt" TIMESTAMP(3),
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "whatsapp_message_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "whatsapp_outbox" (
  "id" TEXT NOT NULL,
  "messageLogId" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "status" "WhatsAppOutboxStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
  "lockedAt" TIMESTAMP(3),
  "processedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "whatsapp_outbox_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "whatsapp_meta_templates_metaTemplateId_key" ON "whatsapp_meta_templates"("metaTemplateId");
CREATE UNIQUE INDEX "whatsapp_meta_templates_name_language_key" ON "whatsapp_meta_templates"("name", "language");
CREATE INDEX "whatsapp_meta_templates_status_idx" ON "whatsapp_meta_templates"("status");
CREATE UNIQUE INDEX "whatsapp_automation_rules_eventCode_key" ON "whatsapp_automation_rules"("eventCode");
CREATE INDEX "whatsapp_automation_rules_enabled_idx" ON "whatsapp_automation_rules"("enabled");
CREATE UNIQUE INDEX "whatsapp_message_logs_metaMessageId_key" ON "whatsapp_message_logs"("metaMessageId");
CREATE INDEX "whatsapp_message_logs_eventCode_createdAt_idx" ON "whatsapp_message_logs"("eventCode", "createdAt");
CREATE INDEX "whatsapp_message_logs_relatedEntityType_relatedEntityId_idx" ON "whatsapp_message_logs"("relatedEntityType", "relatedEntityId");
CREATE INDEX "whatsapp_message_logs_recipientType_status_createdAt_idx" ON "whatsapp_message_logs"("recipientType", "status", "createdAt");
CREATE UNIQUE INDEX "whatsapp_outbox_messageLogId_key" ON "whatsapp_outbox"("messageLogId");
CREATE INDEX "whatsapp_outbox_status_nextAttemptAt_idx" ON "whatsapp_outbox"("status", "nextAttemptAt");

ALTER TABLE "whatsapp_automation_rules"
  ADD CONSTRAINT "whatsapp_automation_rules_templateId_fkey"
  FOREIGN KEY ("templateId") REFERENCES "whatsapp_meta_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "whatsapp_outbox"
  ADD CONSTRAINT "whatsapp_outbox_messageLogId_fkey"
  FOREIGN KEY ("messageLogId") REFERENCES "whatsapp_message_logs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
