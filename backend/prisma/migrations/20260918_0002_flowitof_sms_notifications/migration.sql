DO $$ BEGIN
  CREATE TYPE "SmsMessageStatus" AS ENUM ('QUEUED', 'SENT', 'FAILED', 'SKIPPED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "SmsOutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "sms_integration_settings" (
  "id" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "baseUrl" TEXT NOT NULL DEFAULT 'https://sms.flowitof.com/dev',
  "senderId" TEXT,
  "testRecipientPhone" TEXT,
  "smsDetails" TEXT NOT NULL DEFAULT '0',
  "encryptedApiKey" TEXT,
  "updatedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "sms_integration_settings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "sms_automation_rules" (
  "id" TEXT NOT NULL,
  "eventCode" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "messageId" TEXT,
  "variablesTemplate" TEXT,
  "recipientPolicy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "sms_automation_rules_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "sms_automation_rules_eventCode_key" ON "sms_automation_rules"("eventCode");
CREATE INDEX IF NOT EXISTS "sms_automation_rules_enabled_idx" ON "sms_automation_rules"("enabled");

CREATE TABLE IF NOT EXISTS "sms_message_logs" (
  "id" TEXT NOT NULL,
  "eventCode" TEXT NOT NULL,
  "relatedEntityType" TEXT,
  "relatedEntityId" TEXT,
  "recipientType" TEXT NOT NULL,
  "recipientPhone" TEXT NOT NULL,
  "status" "SmsMessageStatus" NOT NULL DEFAULT 'QUEUED',
  "providerMessageId" TEXT,
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "payloadSnapshot" JSONB,
  "dedupeKey" TEXT,
  "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "sms_message_logs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "sms_message_logs_dedupeKey_key" ON "sms_message_logs"("dedupeKey");
CREATE INDEX IF NOT EXISTS "sms_message_logs_eventCode_createdAt_idx" ON "sms_message_logs"("eventCode", "createdAt");
CREATE INDEX IF NOT EXISTS "sms_message_logs_relatedEntityType_relatedEntityId_idx" ON "sms_message_logs"("relatedEntityType", "relatedEntityId");
CREATE INDEX IF NOT EXISTS "sms_message_logs_recipientType_status_createdAt_idx" ON "sms_message_logs"("recipientType", "status", "createdAt");

CREATE TABLE IF NOT EXISTS "sms_outbox" (
  "id" TEXT NOT NULL,
  "messageLogId" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "status" "SmsOutboxStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
  "lockedAt" TIMESTAMP(3),
  "processedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "sms_outbox_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "sms_outbox_messageLogId_key" ON "sms_outbox"("messageLogId");
CREATE INDEX IF NOT EXISTS "sms_outbox_status_nextAttemptAt_idx" ON "sms_outbox"("status", "nextAttemptAt");
DO $$ BEGIN
  ALTER TABLE "sms_outbox"
    ADD CONSTRAINT "sms_outbox_messageLogId_fkey"
    FOREIGN KEY ("messageLogId") REFERENCES "sms_message_logs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
