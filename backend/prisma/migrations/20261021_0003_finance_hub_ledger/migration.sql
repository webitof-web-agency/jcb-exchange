-- Finance Hub P2 ledger engine: vouchers and voucher lines (double entry).
-- New tables only; foreign keys reference finance hub tables only. The Sold Vehicle id on
-- vouchers is a plain column (no foreign key) so existing Sold Vehicle deletes keep working.
-- CreateEnum
CREATE TYPE "FinVoucherStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'POSTED', 'REJECTED', 'REVERSED');

-- CreateTable
CREATE TABLE "FinVoucher" (
    "id" TEXT NOT NULL,
    "number" VARCHAR(60),
    "type" "FinVoucherType" NOT NULL,
    "date" DATE NOT NULL,
    "yearId" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "status" "FinVoucherStatus" NOT NULL DEFAULT 'DRAFT',
    "narration" TEXT NOT NULL,
    "reference" VARCHAR(80),
    "paymentMethod" VARCHAR(20),
    "partyId" TEXT,
    "sellAccountId" VARCHAR(60),
    "costCentreId" TEXT,
    "totalAmount" DECIMAL(14,2) NOT NULL,
    "sourceType" VARCHAR(40),
    "sourceId" VARCHAR(100),
    "sourceEvent" VARCHAR(60),
    "idempotencyKey" VARCHAR(200),
    "sourceHash" VARCHAR(64),
    "reversalOfId" TEXT,
    "reversalReason" TEXT,
    "rejectReason" TEXT,
    "attachments" JSONB,
    "createdById" TEXT,
    "updatedById" TEXT,
    "submittedById" TEXT,
    "submittedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "postedById" TEXT,
    "postedAt" TIMESTAMP(3),
    "reversedById" TEXT,
    "reversedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinVoucher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinVoucherLine" (
    "id" TEXT NOT NULL,
    "voucherId" TEXT NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "accountId" TEXT NOT NULL,
    "partyId" TEXT,
    "sellAccountId" VARCHAR(60),
    "costCentreId" TEXT,
    "debit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "credit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "narration" VARCHAR(300),
    "billRef" VARCHAR(60),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinVoucherLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FinVoucher_number_key" ON "FinVoucher"("number");

-- CreateIndex
CREATE UNIQUE INDEX "FinVoucher_idempotencyKey_key" ON "FinVoucher"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "FinVoucher_reversalOfId_key" ON "FinVoucher"("reversalOfId");

-- CreateIndex
CREATE INDEX "FinVoucher_date_status_idx" ON "FinVoucher"("date", "status");

-- CreateIndex
CREATE INDEX "FinVoucher_type_date_idx" ON "FinVoucher"("type", "date");

-- CreateIndex
CREATE INDEX "FinVoucher_status_createdAt_idx" ON "FinVoucher"("status", "createdAt");

-- CreateIndex
CREATE INDEX "FinVoucher_sourceType_sourceId_idx" ON "FinVoucher"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "FinVoucher_partyId_idx" ON "FinVoucher"("partyId");

-- CreateIndex
CREATE INDEX "FinVoucher_sellAccountId_idx" ON "FinVoucher"("sellAccountId");

-- CreateIndex
CREATE INDEX "FinVoucherLine_accountId_idx" ON "FinVoucherLine"("accountId");

-- CreateIndex
CREATE INDEX "FinVoucherLine_voucherId_idx" ON "FinVoucherLine"("voucherId");

-- CreateIndex
CREATE INDEX "FinVoucherLine_partyId_idx" ON "FinVoucherLine"("partyId");

-- CreateIndex
CREATE INDEX "FinVoucherLine_sellAccountId_idx" ON "FinVoucherLine"("sellAccountId");

-- CreateIndex
CREATE INDEX "FinVoucherLine_costCentreId_idx" ON "FinVoucherLine"("costCentreId");

-- AddForeignKey
ALTER TABLE "FinVoucher" ADD CONSTRAINT "FinVoucher_yearId_fkey" FOREIGN KEY ("yearId") REFERENCES "FinFinancialYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinVoucher" ADD CONSTRAINT "FinVoucher_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "FinPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinVoucher" ADD CONSTRAINT "FinVoucher_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "FinParty"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinVoucher" ADD CONSTRAINT "FinVoucher_costCentreId_fkey" FOREIGN KEY ("costCentreId") REFERENCES "FinCostCentre"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinVoucher" ADD CONSTRAINT "FinVoucher_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "FinVoucher"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinVoucherLine" ADD CONSTRAINT "FinVoucherLine_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "FinVoucher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinVoucherLine" ADD CONSTRAINT "FinVoucherLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinVoucherLine" ADD CONSTRAINT "FinVoucherLine_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "FinParty"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinVoucherLine" ADD CONSTRAINT "FinVoucherLine_costCentreId_fkey" FOREIGN KEY ("costCentreId") REFERENCES "FinCostCentre"("id") ON DELETE SET NULL ON UPDATE CASCADE;

