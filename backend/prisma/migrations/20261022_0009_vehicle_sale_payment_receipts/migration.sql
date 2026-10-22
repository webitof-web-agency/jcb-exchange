ALTER TABLE "SellAccountPayment"
  ADD COLUMN "receiptNumber" TEXT,
  ADD COLUMN "receiptTokenHash" TEXT,
  ADD COLUMN "receiptTokenExpiresAt" TIMESTAMP(3),
  ADD COLUMN "receiptGeneratedAt" TIMESTAMP(3),
  ADD COLUMN "receiptDelivery" JSONB;

CREATE UNIQUE INDEX "SellAccountPayment_receiptNumber_key"
  ON "SellAccountPayment"("receiptNumber");

CREATE UNIQUE INDEX "SellAccountPayment_receiptTokenHash_key"
  ON "SellAccountPayment"("receiptTokenHash");
