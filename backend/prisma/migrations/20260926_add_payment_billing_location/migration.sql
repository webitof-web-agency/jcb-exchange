ALTER TABLE "ListingPaymentSubmission"
  ADD COLUMN "customerCity" TEXT,
  ADD COLUMN "customerState" TEXT;

ALTER TABLE "CustomerPrimeSubscription"
  ADD COLUMN "customerCity" TEXT,
  ADD COLUMN "customerState" TEXT;
