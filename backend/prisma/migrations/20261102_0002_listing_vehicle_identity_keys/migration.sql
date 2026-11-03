-- Normalized registration and chassis numbers so a vehicle can be found across its listings.
-- Not unique: a sold vehicle may be listed again. Existing rows are filled by
-- scripts/backfill-listing-vehicle-keys.ts.
ALTER TABLE "Listing" ADD COLUMN "registrationNumberKey" TEXT;
ALTER TABLE "Listing" ADD COLUMN "chassisNumberKey" TEXT;

CREATE INDEX "Listing_registrationNumberKey_idx" ON "Listing"("registrationNumberKey");
CREATE INDEX "Listing_chassisNumberKey_idx" ON "Listing"("chassisNumberKey");
