-- Additive Sell Account ledger. Existing tables and data are intentionally untouched.
CREATE TYPE "SellAccountDealStatus" AS ENUM (
  'OPEN',
  'PARTIAL_PAYMENT_RECEIVED',
  'FULL_PAYMENT',
  'RTO_WORK_STARTED',
  'RTO_WORK_IN_PROGRESS',
  'RTO_WORK_FAILED',
  'RTO_WORK_COMPLETED',
  'DEAL_DONE'
);

CREATE TYPE "SellAccountPaymentSide" AS ENUM ('PURCHASER_RECEIPT', 'SELLER_PAYMENT');
CREATE TYPE "SellAccountPaymentMethod" AS ENUM ('CASH', 'UPI', 'BANK_TRANSFER', 'CHEQUE', 'OTHER');
CREATE TYPE "SellAccountTaxMode" AS ENUM ('INCLUSIVE', 'EXCLUSIVE');

CREATE TABLE "SellAccount" (
  "id" TEXT NOT NULL,
  "recordNumber" TEXT NOT NULL,
  "listingId" TEXT,
  "listingTitle" TEXT,
  "ownerName" TEXT NOT NULL,
  "ownerNumber" TEXT NOT NULL,
  "vehicleNumber" TEXT NOT NULL,
  "chassisNumber" TEXT,
  "sellDate" TIMESTAMP(3) NOT NULL,
  "purchaserDate" TIMESTAMP(3),
  "sellerDate" TIMESTAMP(3),
  "vehicleType" TEXT NOT NULL,
  "brandName" TEXT NOT NULL,
  "vehicleModel" TEXT NOT NULL,
  "sellerName" TEXT NOT NULL,
  "sellerNumber" TEXT NOT NULL,
  "purchaserName" TEXT NOT NULL,
  "purchaserNumber" TEXT NOT NULL,
  "sellerState" TEXT,
  "purchaserState" TEXT,
  "purchaseAmount" DECIMAL(14,2) NOT NULL,
  "sellAmount" DECIMAL(14,2) NOT NULL,
  "expenses" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "balanceAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "netProfit" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "netProfitAfterGst" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "gstRatePercent" DECIMAL(5,2) NOT NULL DEFAULT 18,
  "taxMode" "SellAccountTaxMode" NOT NULL DEFAULT 'INCLUSIVE',
  "transferDetails" TEXT NOT NULL,
  "remarks" TEXT,
  "documents" JSONB,
  "dealStatus" "SellAccountDealStatus" NOT NULL DEFAULT 'OPEN',
  "rtoStatusSnapshot" TEXT NOT NULL DEFAULT 'PENDING',
  "createdById" TEXT,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "SellAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SellAccountPayment" (
  "id" TEXT NOT NULL,
  "sellAccountId" TEXT NOT NULL,
  "side" "SellAccountPaymentSide" NOT NULL,
  "amount" DECIMAL(14,2) NOT NULL,
  "paymentDate" TIMESTAMP(3) NOT NULL,
  "method" "SellAccountPaymentMethod" NOT NULL DEFAULT 'OTHER',
  "reference" TEXT,
  "note" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SellAccountPayment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SellAccountStatusHistory" (
  "id" TEXT NOT NULL,
  "sellAccountId" TEXT NOT NULL,
  "oldStatus" "SellAccountDealStatus",
  "newStatus" "SellAccountDealStatus" NOT NULL,
  "reason" TEXT,
  "changedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SellAccountStatusHistory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SellAccount_recordNumber_key" ON "SellAccount"("recordNumber");
CREATE UNIQUE INDEX "SellAccount_listingId_key" ON "SellAccount"("listingId");
CREATE INDEX "SellAccount_dealStatus_updatedAt_idx" ON "SellAccount"("dealStatus", "updatedAt");
CREATE INDEX "SellAccount_vehicleNumber_idx" ON "SellAccount"("vehicleNumber");
CREATE INDEX "SellAccount_deletedAt_idx" ON "SellAccount"("deletedAt");
CREATE INDEX "SellAccountPayment_sellAccountId_side_paymentDate_idx" ON "SellAccountPayment"("sellAccountId", "side", "paymentDate");
CREATE INDEX "SellAccountStatusHistory_sellAccountId_createdAt_idx" ON "SellAccountStatusHistory"("sellAccountId", "createdAt");

ALTER TABLE "SellAccount" ADD CONSTRAINT "SellAccount_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SellAccountPayment" ADD CONSTRAINT "SellAccountPayment_sellAccountId_fkey" FOREIGN KEY ("sellAccountId") REFERENCES "SellAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SellAccountStatusHistory" ADD CONSTRAINT "SellAccountStatusHistory_sellAccountId_fkey" FOREIGN KEY ("sellAccountId") REFERENCES "SellAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
