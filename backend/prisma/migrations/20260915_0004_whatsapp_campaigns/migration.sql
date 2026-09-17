DO $$ BEGIN
  CREATE TYPE "WhatsAppConsentCategory" AS ENUM ('MARKETING', 'JOB_ALERTS');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "WhatsAppCampaignStatus" AS ENUM ('DRAFT', 'SENDING', 'COMPLETED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "whatsapp_consents" (
  "id" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "category" "WhatsAppConsentCategory" NOT NULL,
  "optedIn" BOOLEAN NOT NULL DEFAULT false,
  "source" TEXT,
  "updatedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "whatsapp_consents_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "whatsapp_consents_phone_category_key" ON "whatsapp_consents"("phone", "category");
CREATE INDEX IF NOT EXISTS "whatsapp_consents_category_optedIn_idx" ON "whatsapp_consents"("category", "optedIn");

CREATE TABLE IF NOT EXISTS "whatsapp_campaigns" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "category" "WhatsAppConsentCategory" NOT NULL,
  "templateId" TEXT NOT NULL,
  "status" "WhatsAppCampaignStatus" NOT NULL DEFAULT 'DRAFT',
  "audienceFilters" JSONB,
  "createdByUserId" TEXT NOT NULL,
  "confirmedByUserId" TEXT,
  "confirmedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "whatsapp_campaigns_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "whatsapp_campaigns_status_createdAt_idx" ON "whatsapp_campaigns"("status", "createdAt");
DO $$ BEGIN
  ALTER TABLE "whatsapp_campaigns" ADD CONSTRAINT "whatsapp_campaigns_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "whatsapp_meta_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "whatsapp_campaign_recipients" (
  "id" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "recipientType" "WhatsAppRecipientType" NOT NULL,
  "recipientPhone" TEXT NOT NULL,
  "sourceEntityType" TEXT,
  "sourceEntityId" TEXT,
  "messageLogId" TEXT,
  "status" "WhatsAppMessageStatus" NOT NULL DEFAULT 'QUEUED',
  "errorMessage" TEXT,
  "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "whatsapp_campaign_recipients_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "whatsapp_campaign_recipients_campaignId_recipientPhone_key" ON "whatsapp_campaign_recipients"("campaignId", "recipientPhone");
CREATE INDEX IF NOT EXISTS "whatsapp_campaign_recipients_campaignId_status_idx" ON "whatsapp_campaign_recipients"("campaignId", "status");
DO $$ BEGIN
  ALTER TABLE "whatsapp_campaign_recipients" ADD CONSTRAINT "whatsapp_campaign_recipients_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "whatsapp_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
