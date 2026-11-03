-- Unlist / suspend / block a listing: hidden from the website, with the reason kept on the listing.
ALTER TYPE "ListingStatus" ADD VALUE IF NOT EXISTS 'UNLISTED';
ALTER TYPE "ListingStatus" ADD VALUE IF NOT EXISTS 'SUSPENDED';
ALTER TYPE "ListingStatus" ADD VALUE IF NOT EXISTS 'BLOCKED';

ALTER TABLE "Listing" ADD COLUMN "moderationReason" TEXT;
ALTER TABLE "Listing" ADD COLUMN "moderatedAt" TIMESTAMP(3);
ALTER TABLE "Listing" ADD COLUMN "moderatedById" TEXT;
