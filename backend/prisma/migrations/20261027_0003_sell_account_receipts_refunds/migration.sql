-- Sold Vehicle draft/real money receipts, refunds and sale cancellation. Additive only.
-- Existing payments become ISSUED (they were already treated as real receipts).

-- AlterEnum
ALTER TYPE "SellAccountDealStatus" ADD VALUE 'CANCELLED';

-- CreateEnum
CREATE TYPE "SellAccountReceiptStatus" AS ENUM ('DRAFT', 'ISSUED', 'CANCELLED');
CREATE TYPE "SellAccountRefundStatus" AS ENUM ('REQUESTED', 'APPROVED', 'PAID', 'REJECTED');
CREATE TYPE "SellAccountRefundReason" AS ENUM ('DEAL_CANCELLED', 'EXCESS_PAYMENT', 'PRICE_REDUCTION', 'VEHICLE_RETURN', 'OTHER');

-- AlterTable
ALTER TABLE "SellAccount" ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "cancelledById" TEXT,
ADD COLUMN     "cancelReason" TEXT,
ADD COLUMN     "creditNoteNumber" TEXT,
ADD COLUMN     "creditNoteDate" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "SellAccountPayment" ADD COLUMN     "drawnOn" TEXT,
ADD COLUMN     "receiptStatus" "SellAccountReceiptStatus" NOT NULL DEFAULT 'ISSUED',
ADD COLUMN     "issuedAt" TIMESTAMP(3),
ADD COLUMN     "issuedById" TEXT,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "cancelledById" TEXT,
ADD COLUMN     "cancelReason" TEXT;

-- CreateTable
CREATE TABLE "SellAccountRefund" (
    "id" TEXT NOT NULL,
    "sellAccountId" TEXT NOT NULL,
    "refundNumber" TEXT,
    "status" "SellAccountRefundStatus" NOT NULL DEFAULT 'REQUESTED',
    "reason" "SellAccountRefundReason" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "forfeitAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "method" "SellAccountPaymentMethod" NOT NULL DEFAULT 'BANK_TRANSFER',
    "reference" TEXT,
    "drawnOn" TEXT,
    "refundDate" TIMESTAMP(3),
    "note" TEXT,
    "requestedById" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectedById" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "rejectReason" TEXT,
    "paidById" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SellAccountRefund_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SellAccount_creditNoteNumber_key" ON "SellAccount"("creditNoteNumber");
CREATE UNIQUE INDEX "SellAccountRefund_refundNumber_key" ON "SellAccountRefund"("refundNumber");
CREATE INDEX "SellAccountRefund_sellAccountId_status_idx" ON "SellAccountRefund"("sellAccountId", "status");
CREATE INDEX "SellAccountRefund_status_createdAt_idx" ON "SellAccountRefund"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "SellAccountRefund" ADD CONSTRAINT "SellAccountRefund_sellAccountId_fkey" FOREIGN KEY ("sellAccountId") REFERENCES "SellAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
