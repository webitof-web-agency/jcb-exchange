-- CreateEnum
CREATE TYPE "FinReconStatus" AS ENUM ('MATCHED', 'IGNORED');

-- CreateTable
CREATE TABLE "FinBankRecon" (
    "id" TEXT NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "financeTransactionId" TEXT NOT NULL,
    "voucherLineId" TEXT,
    "status" "FinReconStatus" NOT NULL,
    "method" VARCHAR(20) NOT NULL,
    "note" TEXT,
    "matchedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinBankRecon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinCashCount" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "denominations" JSONB NOT NULL,
    "countedAmount" DECIMAL(14,2) NOT NULL,
    "bookBalance" DECIMAL(14,2) NOT NULL,
    "difference" DECIMAL(14,2) NOT NULL,
    "note" TEXT,
    "countedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinCashCount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FinBankRecon_financeTransactionId_key" ON "FinBankRecon"("financeTransactionId");

-- CreateIndex
CREATE UNIQUE INDEX "FinBankRecon_voucherLineId_key" ON "FinBankRecon"("voucherLineId");

-- CreateIndex
CREATE INDEX "FinBankRecon_bankAccountId_idx" ON "FinBankRecon"("bankAccountId");

-- CreateIndex
CREATE INDEX "FinCashCount_accountId_date_idx" ON "FinCashCount"("accountId", "date");

