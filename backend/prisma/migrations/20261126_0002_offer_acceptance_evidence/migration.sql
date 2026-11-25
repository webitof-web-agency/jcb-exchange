-- Evidence of how an offer was accepted (typed / drawn / scanned signature, or a paper copy recorded by HR), the
-- hash of the accepted letter and the acceptance certificate. Additive and safe to run more than once.

ALTER TYPE "DocumentCategory" ADD VALUE IF NOT EXISTS 'OFFER_LETTER_SIGNED';
ALTER TYPE "DocumentCategory" ADD VALUE IF NOT EXISTS 'OFFER_ACCEPTANCE_CERTIFICATE';

ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "acceptanceMethod" VARCHAR(20);
ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "acceptedName" VARCHAR(160);
ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "acceptedPlace" VARCHAR(120);
ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "acceptedIp" VARCHAR(64);
ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "acceptedUserAgent" VARCHAR(500);
ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "signatureFileUrl" TEXT;
ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "signatureHash" VARCHAR(64);
ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "documentHash" VARCHAR(64);
ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "acceptanceCertificateUrl" TEXT;
ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "acceptanceNote" TEXT;
ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "acceptedById" TEXT;
