-- The signed offer letter of an accepted offer: the letter with the signature placed on it (typed or drawn on the
-- offer link), or the signed copy the candidate / HR uploaded. Additive and safe to run more than once.
ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "signedLetterUrl" TEXT;
