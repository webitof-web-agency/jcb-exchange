CREATE TYPE "ListingPaymentMethod" AS ENUM ('RTGS', 'RAZORPAY');

CREATE TYPE "ListingPaymentStatus" AS ENUM ('PENDING_VERIFICATION', 'APPROVED', 'REJECTED', 'FAILED', 'PAID');

CREATE TABLE "ListingPaymentSubmission" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "method" "ListingPaymentMethod" NOT NULL,
    "status" "ListingPaymentStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "amount" DECIMAL(12,2) NOT NULL,
    "transactionRef" TEXT,
    "paymentNote" TEXT,
    "receiptUrl" TEXT,
    "razorpayOrderId" TEXT,
    "razorpayPaymentId" TEXT,
    "razorpaySignature" TEXT,
    "settingsSnapshot" JSONB NOT NULL,
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ListingPaymentSubmission_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ListingPaymentSubmission_listingId_status_idx" ON "ListingPaymentSubmission"("listingId", "status");

CREATE INDEX "ListingPaymentSubmission_buyerId_status_idx" ON "ListingPaymentSubmission"("buyerId", "status");

CREATE INDEX "ListingPaymentSubmission_partnerId_status_idx" ON "ListingPaymentSubmission"("partnerId", "status");

CREATE INDEX "ListingPaymentSubmission_submittedAt_idx" ON "ListingPaymentSubmission"("submittedAt");

ALTER TABLE "ListingPaymentSubmission" ADD CONSTRAINT "ListingPaymentSubmission_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ListingPaymentSubmission" ADD CONSTRAINT "ListingPaymentSubmission_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ListingPaymentSubmission" ADD CONSTRAINT "ListingPaymentSubmission_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ListingPaymentSubmission" ADD CONSTRAINT "ListingPaymentSubmission_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
