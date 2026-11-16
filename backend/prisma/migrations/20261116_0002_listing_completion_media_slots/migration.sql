ALTER TABLE "ListingCompletionUpload" ADD COLUMN "slot" TEXT;

CREATE INDEX "ListingCompletionUpload_inviteId_slot_idx" ON "ListingCompletionUpload"("inviteId", "slot");
