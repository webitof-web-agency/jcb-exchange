CREATE TABLE "PartnerSignupGstVerification" (
    "id" TEXT NOT NULL,
    "status" "GstVerificationStatus" NOT NULL DEFAULT 'PENDING',
    "gstin" TEXT NOT NULL,
    "maskedGstin" TEXT NOT NULL,
    "requestFingerprint" VARCHAR(64),
    "claimHash" VARCHAR(64) NOT NULL,
    "signupEmailHash" VARCHAR(64),
    "signupMobileHash" VARCHAR(64),
    "countryId" INTEGER,
    "stateId" INTEGER,
    "cityId" INTEGER,
    "gstinStatus" TEXT,
    "businessName" TEXT,
    "legalName" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'SUREPASS',
    "providerClientId" TEXT,
    "messageCode" TEXT,
    "safeMessage" TEXT,
    "encryptedResult" TEXT,
    "rawDataExpiresAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "consumedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "PartnerSignupGstVerification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PartnerSignupGstVerification_claimHash_key"
ON "PartnerSignupGstVerification"("claimHash");

CREATE INDEX "PartnerSignupGstVerification_status_createdAt_idx"
ON "PartnerSignupGstVerification"("status", "createdAt");

CREATE INDEX "PartnerSignupGstVerification_gstin_createdAt_idx"
ON "PartnerSignupGstVerification"("gstin", "createdAt");

CREATE INDEX "PartnerSignupGstVerification_requestFingerprint_status_completedAt_idx"
ON "PartnerSignupGstVerification"("requestFingerprint", "status", "completedAt");

CREATE INDEX "PartnerSignupGstVerification_expiresAt_idx"
ON "PartnerSignupGstVerification"("expiresAt");

CREATE INDEX "PartnerSignupGstVerification_countryId_stateId_cityId_idx"
ON "PartnerSignupGstVerification"("countryId", "stateId", "cityId");

ALTER TABLE "PartnerSignupGstVerification"
ADD CONSTRAINT "PartnerSignupGstVerification_countryId_fkey"
FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PartnerSignupGstVerification"
ADD CONSTRAINT "PartnerSignupGstVerification_stateId_fkey"
FOREIGN KEY ("stateId") REFERENCES "State"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PartnerSignupGstVerification"
ADD CONSTRAINT "PartnerSignupGstVerification_cityId_fkey"
FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PartnerSignupGstVerification"
ADD CONSTRAINT "PartnerSignupGstVerification_consumedByUserId_fkey"
FOREIGN KEY ("consumedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PartnerProfile"
ADD COLUMN "partnerCode" TEXT,
ADD COLUMN "gstVerificationRecordId" TEXT,
ADD COLUMN "gstVerifiedAt" TIMESTAMP(3),
ADD COLUMN "countryId" INTEGER,
ADD COLUMN "stateId" INTEGER,
ADD COLUMN "cityId" INTEGER;

CREATE UNIQUE INDEX "PartnerProfile_partnerCode_key"
ON "PartnerProfile"("partnerCode");

CREATE UNIQUE INDEX "PartnerProfile_gstVerificationRecordId_key"
ON "PartnerProfile"("gstVerificationRecordId");

CREATE INDEX "PartnerProfile_countryId_stateId_cityId_idx"
ON "PartnerProfile"("countryId", "stateId", "cityId");

ALTER TABLE "PartnerProfile"
ADD CONSTRAINT "PartnerProfile_gstVerificationRecordId_fkey"
FOREIGN KEY ("gstVerificationRecordId") REFERENCES "GstVerificationRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PartnerProfile"
ADD CONSTRAINT "PartnerProfile_countryId_fkey"
FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PartnerProfile"
ADD CONSTRAINT "PartnerProfile_stateId_fkey"
FOREIGN KEY ("stateId") REFERENCES "State"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PartnerProfile"
ADD CONSTRAINT "PartnerProfile_cityId_fkey"
FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE SET NULL ON UPDATE CASCADE;
