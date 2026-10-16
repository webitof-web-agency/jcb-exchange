CREATE TYPE "PartnerAgreementDefinitionStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

CREATE TABLE "PartnerAgreementDefinition" (
    "id" TEXT NOT NULL,
    "agreementType" "AgreementType" NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "content" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "applicablePartnerTypes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "status" "PartnerAgreementDefinitionStatus" NOT NULL DEFAULT 'DRAFT',
    "effectiveFrom" TIMESTAMP(3),
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerAgreementDefinition_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PartnerAgreementDefinition_agreementType_key" ON "PartnerAgreementDefinition"("agreementType");
CREATE INDEX "PartnerAgreementDefinition_status_displayOrder_idx" ON "PartnerAgreementDefinition"("status", "displayOrder");

ALTER TABLE "PartnerAgreement" ADD COLUMN "definitionId" TEXT;
ALTER TABLE "PartnerAgreement" ADD COLUMN "titleSnapshot" TEXT;
ALTER TABLE "PartnerAgreement" ADD COLUMN "contentHash" VARCHAR(64);
ALTER TABLE "PartnerAgreement" ADD COLUMN "userAgent" TEXT;

CREATE INDEX "PartnerAgreement_definitionId_idx" ON "PartnerAgreement"("definitionId");

ALTER TABLE "PartnerAgreement" ADD CONSTRAINT "PartnerAgreement_definitionId_fkey"
  FOREIGN KEY ("definitionId") REFERENCES "PartnerAgreementDefinition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "PartnerAgreementDefinition"
  ("id", "agreementType", "title", "summary", "content", "version", "applicablePartnerTypes", "isRequired", "status", "displayOrder", "createdAt", "updatedAt")
VALUES
  ('a0000000-0000-4000-8000-000000000001', 'MARKETPLACE_TERMS', 'Marketplace terms', 'Confirms platform rules, account conduct, and approval flow.', 'By accepting these marketplace terms, you agree to follow platform rules, provide accurate information, and complete the required approval process.', 'v1.0', ARRAY['SHOWROOM', 'BROKER'], true, 'PUBLISHED', 10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('a0000000-0000-4000-8000-000000000002', 'PARTNER_TERMS', 'Partner terms', 'Confirms your responsibilities as an approved broker or authorized place partner.', 'You agree to maintain accurate business information, cooperate with verification, and follow the responsibilities applicable to your partner account.', 'v1.0', ARRAY['SHOWROOM', 'BROKER'], true, 'PUBLISHED', 20, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('a0000000-0000-4000-8000-000000000003', 'LISTING_AUTHENTICITY', 'Listing authenticity declaration', 'Declares that listing details, pricing, and inventory claims shared by you are genuine.', 'You confirm that every listing, specification, price, availability statement, and inventory claim submitted by you is accurate and genuine.', 'v1.0', ARRAY['SHOWROOM', 'BROKER'], true, 'PUBLISHED', 30, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('a0000000-0000-4000-8000-000000000004', 'MEDIA_OWNERSHIP', 'Media ownership and usage', 'Confirms you own or are authorised to use uploaded listing media.', 'You confirm that you own or have permission to use all photos, videos, logos, and other media submitted to the platform, and grant the platform the rights needed to display them with the listing.', 'v1.0', ARRAY['SHOWROOM', 'BROKER'], true, 'PUBLISHED', 40, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('a0000000-0000-4000-8000-000000000005', 'CUSTOMER_DATA_USAGE', 'Customer data usage', 'Confirms responsible handling of customer and lead information.', 'You agree to use customer and lead information only for legitimate marketplace communication, protect it from misuse, and comply with applicable privacy requirements.', 'v1.0', ARRAY['SHOWROOM', 'BROKER'], true, 'PUBLISHED', 50, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('a0000000-0000-4000-8000-000000000006', 'FRAUD_POLICY', 'Fraud and misuse policy', 'Confirms that fraudulent, misleading, or abusive activity is prohibited.', 'You agree not to submit fraudulent information, manipulate leads or listings, impersonate another party, or misuse the platform. Violations may result in suspension or termination.', 'v1.0', ARRAY['SHOWROOM', 'BROKER'], true, 'PUBLISHED', 60, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('a0000000-0000-4000-8000-000000000007', 'COMMISSION_POLICY', 'Commission policy', 'Confirms understanding of applicable commission and payment terms.', 'You acknowledge that applicable commission, service fees, payment timelines, and related commercial terms are governed by the platform policy communicated for your account and transactions.', 'v1.0', ARRAY['SHOWROOM', 'BROKER'], true, 'PUBLISHED', 70, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
