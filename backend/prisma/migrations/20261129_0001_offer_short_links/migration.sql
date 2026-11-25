-- Short offer links (https://<site>/o/<code>) for SMS (DLT) variables and WhatsApp URL buttons. One row per offer
-- link version; it stores no token (the signed link is rebuilt from offerId + version + expiry). Additive and safe to
-- run more than once.
CREATE TABLE IF NOT EXISTS "OfferShortLink" (
  "id" TEXT NOT NULL,
  "code" VARCHAR(16) NOT NULL,
  "offerId" TEXT NOT NULL,
  "tokenVersion" INTEGER NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "openCount" INTEGER NOT NULL DEFAULT 0,
  "lastOpenedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OfferShortLink_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "OfferShortLink_code_key" ON "OfferShortLink"("code");
CREATE UNIQUE INDEX IF NOT EXISTS "OfferShortLink_offerId_tokenVersion_key" ON "OfferShortLink"("offerId", "tokenVersion");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OfferShortLink_offerId_fkey') THEN
    ALTER TABLE "OfferShortLink" ADD CONSTRAINT "OfferShortLink_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
