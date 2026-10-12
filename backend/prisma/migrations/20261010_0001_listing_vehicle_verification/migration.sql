CREATE TYPE "ListingVerificationStatus" AS ENUM (
  'NOT_VERIFIED',
  'API_VERIFIED',
  'MANUALLY_MODIFIED',
  'REVERIFICATION_REQUIRED'
);

CREATE TABLE "ListingVehicleVerification" (
  "id" TEXT NOT NULL,
  "listingId" TEXT NOT NULL,
  "verificationRecordId" TEXT,
  "status" "ListingVerificationStatus" NOT NULL DEFAULT 'NOT_VERIFIED',
  "verifiedChassisNumber" TEXT,
  "verifiedEngineNumber" TEXT,
  "verifiedFieldHashes" JSONB,
  "changedFields" JSONB,
  "lastVerifiedAt" TIMESTAMP(3),
  "lastModifiedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ListingVehicleVerification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ListingVehicleVerification_listingId_key"
  ON "ListingVehicleVerification"("listingId");
CREATE INDEX "ListingVehicleVerification_status_updatedAt_idx"
  ON "ListingVehicleVerification"("status", "updatedAt");
CREATE INDEX "ListingVehicleVerification_verificationRecordId_idx"
  ON "ListingVehicleVerification"("verificationRecordId");

ALTER TABLE "ListingVehicleVerification"
  ADD CONSTRAINT "ListingVehicleVerification_listingId_fkey"
  FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TYPE "AuditEntityType" ADD VALUE 'LISTING_VERIFICATION';
