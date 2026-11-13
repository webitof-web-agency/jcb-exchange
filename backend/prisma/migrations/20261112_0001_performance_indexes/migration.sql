-- Indexes found missing during the 2026-11-12 load test (20k listings / 300k notifications):
--   every listing card/detail reads Media by listingId, the notification bell reads by userId,
--   partner dashboards read listings by partnerId, the public feed filters by status and sorts by createdAt.
-- IF NOT EXISTS keeps the migration safe to re-run. Tables are small in production today, so a plain
-- CREATE INDEX (short lock) is fine.
CREATE INDEX IF NOT EXISTS "Media_listingId_idx" ON "Media"("listingId");
CREATE INDEX IF NOT EXISTS "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "Listing_partnerId_idx" ON "Listing"("partnerId");
CREATE INDEX IF NOT EXISTS "Listing_status_createdAt_idx" ON "Listing"("status", "createdAt");
