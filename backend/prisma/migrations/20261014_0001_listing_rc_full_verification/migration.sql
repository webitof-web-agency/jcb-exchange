CREATE TYPE "ListingVerificationSource" AS ENUM ('CHASSIS', 'RC_FULL');

ALTER TABLE "ListingVehicleVerification"
  ADD COLUMN "verificationSource" "ListingVerificationSource",
  ADD COLUMN "verifiedRegistrationNumber" TEXT;
