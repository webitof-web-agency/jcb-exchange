-- CreateEnum
CREATE TYPE "ListingCompletionInviteStatus" AS ENUM ('ACTIVE', 'SUBMITTED', 'EXPIRED', 'REVOKED');

-- CreateTable
CREATE TABLE "ListingCompletionInvite" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "status" "ListingCompletionInviteStatus" NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastAccessedAt" TIMESTAMP(3),
    "usedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ListingCompletionInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListingCompletionUpload" (
    "id" TEXT NOT NULL,
    "inviteId" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "mediaType" TEXT NOT NULL,
    "claimedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ListingCompletionUpload_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ListingCompletionInvite_tokenHash_key" ON "ListingCompletionInvite"("tokenHash");
CREATE INDEX "ListingCompletionInvite_listingId_status_idx" ON "ListingCompletionInvite"("listingId", "status");
CREATE INDEX "ListingCompletionInvite_partnerId_status_idx" ON "ListingCompletionInvite"("partnerId", "status");
CREATE INDEX "ListingCompletionInvite_status_expiresAt_idx" ON "ListingCompletionInvite"("status", "expiresAt");
CREATE INDEX "ListingCompletionUpload_inviteId_claimedAt_idx" ON "ListingCompletionUpload"("inviteId", "claimedAt");

-- AddForeignKey
ALTER TABLE "ListingCompletionInvite" ADD CONSTRAINT "ListingCompletionInvite_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ListingCompletionInvite" ADD CONSTRAINT "ListingCompletionInvite_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ListingCompletionUpload" ADD CONSTRAINT "ListingCompletionUpload_inviteId_fkey" FOREIGN KEY ("inviteId") REFERENCES "ListingCompletionInvite"("id") ON DELETE CASCADE ON UPDATE CASCADE;
