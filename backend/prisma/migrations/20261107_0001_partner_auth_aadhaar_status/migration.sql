-- Retain only the partner Auth Aadhaar verification status, never the Aadhaar number or template.
ALTER TABLE "PartnerProfile"
  ADD COLUMN "aadhaarVerifiedAt" TIMESTAMP(3);
