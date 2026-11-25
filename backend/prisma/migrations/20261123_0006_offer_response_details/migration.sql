-- Persist the candidate's decline reason with the offer response.
ALTER TABLE "Offer" ADD COLUMN "declineReason" TEXT;
