-- AlterTable
ALTER TABLE "SellAccount" ADD COLUMN IF NOT EXISTS "profitInvoiceNumber" TEXT;
ALTER TABLE "SellAccount" ADD COLUMN IF NOT EXISTS "profitInvoiceGeneratedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "SellAccount_profitInvoiceNumber_key" ON "SellAccount"("profitInvoiceNumber");
