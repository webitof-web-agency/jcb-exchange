CREATE TYPE "FinanceTransactionType" AS ENUM ('DEBIT', 'CREDIT', 'TRANSFER');
CREATE TYPE "FinancePaymentMethod" AS ENUM ('CASH', 'UPI', 'NEFT', 'RTGS', 'IMPS', 'BANK_TRANSFER', 'DEBIT_CARD', 'CREDIT_CARD', 'CHEQUE', 'OTHER');
CREATE TYPE "FinanceTransactionSource" AS ENUM ('MANUAL', 'IMPORT');
CREATE TYPE "FinanceTransactionStatus" AS ENUM ('POSTED', 'VOIDED');
CREATE TYPE "FinanceImportStatus" AS ENUM ('COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED');

CREATE TABLE "FinanceImportBatch" (
  "id" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "bankName" TEXT,
  "accountName" TEXT,
  "statementFrom" TIMESTAMP(3),
  "statementTo" TIMESTAMP(3),
  "openingBalance" DECIMAL(14,2),
  "closingBalance" DECIMAL(14,2),
  "totalRows" INTEGER NOT NULL DEFAULT 0,
  "importedRows" INTEGER NOT NULL DEFAULT 0,
  "duplicateRows" INTEGER NOT NULL DEFAULT 0,
  "failedRows" INTEGER NOT NULL DEFAULT 0,
  "status" "FinanceImportStatus" NOT NULL DEFAULT 'COMPLETED',
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinanceImportBatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FinanceTransaction" (
  "id" TEXT NOT NULL,
  "transactionDate" TIMESTAMP(3) NOT NULL,
  "valueDate" TIMESTAMP(3),
  "type" "FinanceTransactionType" NOT NULL,
  "amount" DECIMAL(14,2) NOT NULL,
  "balance" DECIMAL(14,2),
  "accountName" TEXT NOT NULL DEFAULT 'Cash',
  "paymentMethod" "FinancePaymentMethod" NOT NULL DEFAULT 'OTHER',
  "name" TEXT NOT NULL,
  "category" TEXT NOT NULL DEFAULT 'Miscellaneous',
  "narration" TEXT NOT NULL,
  "reference" TEXT,
  "chequeNumber" TEXT,
  "invoiceNumber" TEXT,
  "attachmentUrl" TEXT,
  "notes" TEXT,
  "source" "FinanceTransactionSource" NOT NULL DEFAULT 'MANUAL',
  "status" "FinanceTransactionStatus" NOT NULL DEFAULT 'POSTED',
  "fingerprint" TEXT,
  "rawData" JSONB,
  "importBatchId" TEXT,
  "createdByUserId" TEXT,
  "updatedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FinanceTransaction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FinanceTransaction_fingerprint_key" ON "FinanceTransaction"("fingerprint");
CREATE INDEX "FinanceImportBatch_createdAt_idx" ON "FinanceImportBatch"("createdAt");
CREATE INDEX "FinanceImportBatch_accountName_statementFrom_statementTo_idx" ON "FinanceImportBatch"("accountName", "statementFrom", "statementTo");
CREATE INDEX "FinanceTransaction_transactionDate_idx" ON "FinanceTransaction"("transactionDate");
CREATE INDEX "FinanceTransaction_type_transactionDate_idx" ON "FinanceTransaction"("type", "transactionDate");
CREATE INDEX "FinanceTransaction_category_transactionDate_idx" ON "FinanceTransaction"("category", "transactionDate");
CREATE INDEX "FinanceTransaction_accountName_transactionDate_idx" ON "FinanceTransaction"("accountName", "transactionDate");
CREATE INDEX "FinanceTransaction_status_transactionDate_idx" ON "FinanceTransaction"("status", "transactionDate");
CREATE INDEX "FinanceTransaction_importBatchId_idx" ON "FinanceTransaction"("importBatchId");
CREATE INDEX "FinanceTransaction_reference_idx" ON "FinanceTransaction"("reference");

ALTER TABLE "FinanceTransaction"
  ADD CONSTRAINT "FinanceTransaction_importBatchId_fkey"
  FOREIGN KEY ("importBatchId") REFERENCES "FinanceImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
