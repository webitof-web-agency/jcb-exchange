CREATE TYPE "SellAccountDeedSide" AS ENUM ('PURCHASE', 'SALE');
CREATE TYPE "SellAccountDeedWorkflowStatus" AS ENUM ('INITIALIZING', 'PENDING_SIGNATURE', 'SIGNED', 'FAILED', 'RECONCILIATION_REQUIRED');

CREATE TABLE "SellAccountDeedWorkflow" (
  "id" TEXT NOT NULL,
  "sellAccountId" TEXT NOT NULL,
  "side" "SellAccountDeedSide" NOT NULL,
  "status" "SellAccountDeedWorkflowStatus" NOT NULL DEFAULT 'INITIALIZING',
  "sourceDocument" JSONB NOT NULL,
  "sourceLinkTokenHash" TEXT,
  "sourceLinkExpiresAt" TIMESTAMP(3),
  "executionStateCode" VARCHAR(2) NOT NULL,
  "executionStateName" TEXT NOT NULL,
  "articleId" INTEGER NOT NULL,
  "stampDuty" INTEGER NOT NULL,
  "considerationAmount" INTEGER NOT NULL,
  "signerName" TEXT NOT NULL,
  "signerMobile" TEXT NOT NULL,
  "signerEmail" TEXT,
  "signature" JSONB NOT NULL,
  "providerEnvironment" "SurepassEnvironment" NOT NULL,
  "esignClientId" TEXT,
  "providerStatus" TEXT,
  "signingUrlCiphertext" TEXT,
  "signedDocument" JSONB,
  "auditTrail" JSONB,
  "providerChargeStatus" TEXT NOT NULL DEFAULT 'PENDING_RECONCILIATION',
  "providerChargedAmountPaise" INTEGER,
  "providerChargeReference" TEXT,
  "lastErrorCode" TEXT,
  "lastErrorMessage" TEXT,
  "requestedById" TEXT,
  "signedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SellAccountDeedWorkflow_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SellAccountDeedWorkflow_sourceLinkTokenHash_key" ON "SellAccountDeedWorkflow"("sourceLinkTokenHash");
CREATE UNIQUE INDEX "SellAccountDeedWorkflow_esignClientId_key" ON "SellAccountDeedWorkflow"("esignClientId");
CREATE UNIQUE INDEX "SellAccountDeedWorkflow_providerChargeReference_key" ON "SellAccountDeedWorkflow"("providerChargeReference");
CREATE UNIQUE INDEX "SellAccountDeedWorkflow_sellAccountId_side_key" ON "SellAccountDeedWorkflow"("sellAccountId", "side");
CREATE INDEX "SellAccountDeedWorkflow_sellAccountId_updatedAt_idx" ON "SellAccountDeedWorkflow"("sellAccountId", "updatedAt");
CREATE INDEX "SellAccountDeedWorkflow_status_updatedAt_idx" ON "SellAccountDeedWorkflow"("status", "updatedAt");
ALTER TABLE "SellAccountDeedWorkflow" ADD CONSTRAINT "SellAccountDeedWorkflow_sellAccountId_fkey" FOREIGN KEY ("sellAccountId") REFERENCES "SellAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
