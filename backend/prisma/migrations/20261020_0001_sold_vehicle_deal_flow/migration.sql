-- Sold Vehicle deal flow: purchase -> broker (JCB Exchange) -> sale, exchange support,
-- RTO ownership-transfer tasks with mandatory remarks, and the customer sale invoice.

CREATE TYPE "SellAccountSourceType" AS ENUM ('PARTNER', 'AGENT', 'DIRECT_CUSTOMER', 'JCB_EXCHANGE');
CREATE TYPE "SellAccountPurchaseType" AS ENUM ('PURCHASE', 'EXCHANGE');
CREATE TYPE "SellAccountSaleType" AS ENUM ('SELL', 'EXCHANGE');
CREATE TYPE "RtoTransferTaskStatus" AS ENUM ('PENDING', 'DOCUMENT_EXPIRED', 'RENEWAL_IN_PROGRESS', 'TRANSFER_INITIATED', 'ISSUE_REPORTED', 'TRANSFERRED', 'NOT_REQUIRED');

ALTER TABLE "SellAccount" ADD COLUMN "sellerCity" TEXT;
ALTER TABLE "SellAccount" ADD COLUMN "purchaserCity" TEXT;
ALTER TABLE "SellAccount" ADD COLUMN "sourceType" "SellAccountSourceType";
ALTER TABLE "SellAccount" ADD COLUMN "purchaseType" "SellAccountPurchaseType" NOT NULL DEFAULT 'PURCHASE';
ALTER TABLE "SellAccount" ADD COLUMN "saleType" "SellAccountSaleType" NOT NULL DEFAULT 'SELL';
ALTER TABLE "SellAccount" ADD COLUMN "purchaseExchangeValue" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "SellAccount" ADD COLUMN "purchaseExchangeVehicle" TEXT;
ALTER TABLE "SellAccount" ADD COLUMN "saleExchangeValue" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "SellAccount" ADD COLUMN "saleExchangeVehicle" TEXT;
ALTER TABLE "SellAccount" ADD COLUMN "brokerName" TEXT;
ALTER TABLE "SellAccount" ADD COLUMN "brokerNumber" TEXT;
ALTER TABLE "SellAccount" ADD COLUMN "expenseBreakdown" JSONB;
ALTER TABLE "SellAccount" ADD COLUMN "completedAt" TIMESTAMP(3);
ALTER TABLE "SellAccount" ADD COLUMN "invoiceNumber" TEXT;
ALTER TABLE "SellAccount" ADD COLUMN "invoiceGeneratedAt" TIMESTAMP(3);
ALTER TABLE "SellAccount" ADD COLUMN "invoiceTokenHash" TEXT;
ALTER TABLE "SellAccount" ADD COLUMN "invoiceTokenExpiresAt" TIMESTAMP(3);
ALTER TABLE "SellAccount" ADD COLUMN "invoiceSentAt" TIMESTAMP(3);
ALTER TABLE "SellAccount" ADD COLUMN "invoiceDelivery" JSONB;

CREATE UNIQUE INDEX "SellAccount_invoiceNumber_key" ON "SellAccount"("invoiceNumber");
CREATE UNIQUE INDEX "SellAccount_invoiceTokenHash_key" ON "SellAccount"("invoiceTokenHash");

ALTER TABLE "VehicleRtoRecord" ADD COLUMN "complianceSnapshot" JSONB;
ALTER TABLE "VehicleRtoRecord" ADD COLUMN "complianceCheckedAt" TIMESTAMP(3);

CREATE TABLE "VehicleRtoStatusLog" (
    "id" TEXT NOT NULL,
    "rtoRecordId" TEXT NOT NULL,
    "oldStatus" TEXT,
    "newStatus" TEXT NOT NULL,
    "remark" TEXT NOT NULL,
    "changedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VehicleRtoStatusLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "VehicleRtoStatusLog_rtoRecordId_createdAt_idx" ON "VehicleRtoStatusLog"("rtoRecordId", "createdAt");

ALTER TABLE "VehicleRtoStatusLog"
ADD CONSTRAINT "VehicleRtoStatusLog_rtoRecordId_fkey"
FOREIGN KEY ("rtoRecordId") REFERENCES "VehicleRtoRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "RtoTransferTask" (
    "id" TEXT NOT NULL,
    "rtoRecordId" TEXT NOT NULL,
    "taskKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "isOptional" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" "RtoTransferTaskStatus" NOT NULL DEFAULT 'PENDING',
    "remark" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RtoTransferTask_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RtoTransferTask_rtoRecordId_taskKey_key" ON "RtoTransferTask"("rtoRecordId", "taskKey");
CREATE INDEX "RtoTransferTask_status_idx" ON "RtoTransferTask"("status");

ALTER TABLE "RtoTransferTask"
ADD CONSTRAINT "RtoTransferTask_rtoRecordId_fkey"
FOREIGN KEY ("rtoRecordId") REFERENCES "VehicleRtoRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "RtoTransferTaskLog" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "oldStatus" "RtoTransferTaskStatus",
    "newStatus" "RtoTransferTaskStatus" NOT NULL,
    "remark" TEXT NOT NULL,
    "changedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RtoTransferTaskLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RtoTransferTaskLog_taskId_createdAt_idx" ON "RtoTransferTaskLog"("taskId", "createdAt");

ALTER TABLE "RtoTransferTaskLog"
ADD CONSTRAINT "RtoTransferTaskLog_taskId_fkey"
FOREIGN KEY ("taskId") REFERENCES "RtoTransferTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
