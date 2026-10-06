CREATE TYPE "ListingBillType" AS ENUM ('NON_TAX', 'TAX_INVOICE');

CREATE TABLE "ListingBill" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "billType" "ListingBillType" NOT NULL,
    "payload" JSONB NOT NULL,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ListingBill_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ListingBill_paymentId_billType_key" ON "ListingBill"("paymentId", "billType");
CREATE INDEX "ListingBill_updatedAt_idx" ON "ListingBill"("updatedAt");

ALTER TABLE "ListingBill" ADD CONSTRAINT "ListingBill_paymentId_fkey"
  FOREIGN KEY ("paymentId") REFERENCES "ListingPaymentSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ListingBill" ADD CONSTRAINT "ListingBill_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
