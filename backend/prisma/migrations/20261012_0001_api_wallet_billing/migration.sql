CREATE TYPE "ApiBillingMode" AS ENUM ('DISABLED', 'ACTIVE');
CREATE TYPE "ApiBillingLedgerType" AS ENUM ('CREDIT', 'DEBIT');
CREATE TYPE "ApiBillingWebhookEventType" AS ENUM ('WALLET_CREDIT', 'SERVICE_PRICE_SET', 'WALLET_MODE_SET');
CREATE TYPE "ApiBillingWebhookStatus" AS ENUM ('PROCESSED', 'FAILED');
CREATE TYPE "ApiBillableService" AS ENUM (
  'PAN_VERIFICATION',
  'GST_VERIFICATION',
  'MOBILE_TO_PAN',
  'DRIVING_LICENSE_VERIFICATION',
  'RC_OWNER_HISTORY',
  'RC_CHALLAN',
  'CHASSIS_TO_RC',
  'RC_TO_MOBILE',
  'MOBILE_TO_RC',
  'RC_MOBILE_NUMBER_CHECK'
);

CREATE TABLE "ApiWallet" (
  "id" TEXT NOT NULL DEFAULT 'platform',
  "currency" VARCHAR(3) NOT NULL DEFAULT 'INR',
  "balancePaise" INTEGER NOT NULL DEFAULT 0,
  "mode" "ApiBillingMode" NOT NULL DEFAULT 'DISABLED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ApiWallet_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ApiServicePrice" (
  "serviceKey" "ApiBillableService" NOT NULL,
  "amountPaise" INTEGER NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT false,
  "version" INTEGER NOT NULL DEFAULT 1,
  "updatedBySource" VARCHAR(64),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ApiServicePrice_pkey" PRIMARY KEY ("serviceKey")
);

CREATE TABLE "ApiUsageRecord" (
  "id" TEXT NOT NULL,
  "walletId" TEXT NOT NULL,
  "serviceKey" "ApiBillableService" NOT NULL,
  "verificationRecordId" VARCHAR(100) NOT NULL,
  "providerAttemptId" VARCHAR(100) NOT NULL,
  "requestedById" TEXT NOT NULL,
  "amountPaise" INTEGER NOT NULL,
  "priceVersion" INTEGER NOT NULL,
  "currency" VARCHAR(3) NOT NULL DEFAULT 'INR',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ApiUsageRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ApiWalletLedger" (
  "id" TEXT NOT NULL,
  "walletId" TEXT NOT NULL,
  "type" "ApiBillingLedgerType" NOT NULL,
  "amountPaise" INTEGER NOT NULL,
  "balanceBeforePaise" INTEGER NOT NULL,
  "balanceAfterPaise" INTEGER NOT NULL,
  "serviceKey" "ApiBillableService",
  "usageId" TEXT,
  "externalTransactionId" VARCHAR(150),
  "idempotencyKey" VARCHAR(200) NOT NULL,
  "requestedById" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ApiWalletLedger_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ApiBillingWebhookEvent" (
  "id" TEXT NOT NULL,
  "eventId" VARCHAR(150) NOT NULL,
  "eventType" "ApiBillingWebhookEventType" NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "payloadChecksum" VARCHAR(64) NOT NULL,
  "status" "ApiBillingWebhookStatus" NOT NULL,
  "outcome" JSONB,
  "processedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ApiBillingWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ApiUsageRecord_providerAttemptId_key" ON "ApiUsageRecord"("providerAttemptId");
CREATE INDEX "ApiUsageRecord_serviceKey_createdAt_idx" ON "ApiUsageRecord"("serviceKey", "createdAt");
CREATE INDEX "ApiUsageRecord_requestedById_createdAt_idx" ON "ApiUsageRecord"("requestedById", "createdAt");
CREATE INDEX "ApiUsageRecord_verificationRecordId_createdAt_idx" ON "ApiUsageRecord"("verificationRecordId", "createdAt");

CREATE UNIQUE INDEX "ApiWalletLedger_usageId_key" ON "ApiWalletLedger"("usageId");
CREATE UNIQUE INDEX "ApiWalletLedger_externalTransactionId_key" ON "ApiWalletLedger"("externalTransactionId");
CREATE UNIQUE INDEX "ApiWalletLedger_idempotencyKey_key" ON "ApiWalletLedger"("idempotencyKey");
CREATE INDEX "ApiWalletLedger_walletId_createdAt_idx" ON "ApiWalletLedger"("walletId", "createdAt");
CREATE INDEX "ApiWalletLedger_serviceKey_createdAt_idx" ON "ApiWalletLedger"("serviceKey", "createdAt");
CREATE INDEX "ApiWalletLedger_requestedById_createdAt_idx" ON "ApiWalletLedger"("requestedById", "createdAt");

CREATE UNIQUE INDEX "ApiBillingWebhookEvent_eventId_key" ON "ApiBillingWebhookEvent"("eventId");
CREATE INDEX "ApiBillingWebhookEvent_eventType_createdAt_idx" ON "ApiBillingWebhookEvent"("eventType", "createdAt");

ALTER TABLE "ApiUsageRecord"
  ADD CONSTRAINT "ApiUsageRecord_walletId_fkey"
  FOREIGN KEY ("walletId") REFERENCES "ApiWallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ApiUsageRecord_requestedById_fkey"
  FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ApiWalletLedger"
  ADD CONSTRAINT "ApiWalletLedger_walletId_fkey"
  FOREIGN KEY ("walletId") REFERENCES "ApiWallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ApiWalletLedger_usageId_fkey"
  FOREIGN KEY ("usageId") REFERENCES "ApiUsageRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "ApiWalletLedger_requestedById_fkey"
  FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "ApiWallet" ("id", "currency", "balancePaise", "mode", "updatedAt")
VALUES ('platform', 'INR', 0, 'DISABLED', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
