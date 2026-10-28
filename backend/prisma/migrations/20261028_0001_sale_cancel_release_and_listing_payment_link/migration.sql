-- Cancelled sales release their listing (kept here) so the vehicle can be sold again.
ALTER TABLE "SellAccount" ADD COLUMN "releasedListingId" TEXT;

-- A Sold Vehicle receipt can record a website listing payment.
ALTER TABLE "SellAccountPayment" ADD COLUMN "listingPaymentId" TEXT;
CREATE UNIQUE INDEX "SellAccountPayment_listingPaymentId_key" ON "SellAccountPayment"("listingPaymentId");
