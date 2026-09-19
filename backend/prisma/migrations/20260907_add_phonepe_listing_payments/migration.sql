ALTER TYPE "ListingPaymentMethod" ADD VALUE IF NOT EXISTS 'PHONEPE';

ALTER TABLE "ListingPaymentSubmission"
ADD COLUMN IF NOT EXISTS "phonepeMerchantOrderId" TEXT,
ADD COLUMN IF NOT EXISTS "phonepeOrderId" TEXT,
ADD COLUMN IF NOT EXISTS "phonepeTransactionId" TEXT;

CREATE INDEX IF NOT EXISTS "ListingPaymentSubmission_phonepeMerchantOrderId_idx"
ON "ListingPaymentSubmission"("phonepeMerchantOrderId");
