-- Advanced analytics event store.
-- Additive only: no existing table, column, or migration is changed.
CREATE TABLE "AnalyticsEvent" (
    "id" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "anonymousId" TEXT,
    "sessionId" TEXT,
    "actorUserId" TEXT,
    "listingId" TEXT,
    "partnerId" TEXT,
    "brandId" TEXT,
    "modelId" TEXT,
    "categoryId" TEXT,
    "manufacturingYear" INTEGER,
    "query" TEXT,
    "filterPayload" JSONB,
    "resultCount" INTEGER,
    "source" TEXT,
    "dedupeKey" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalyticsEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AnalyticsEvent_dedupeKey_key" ON "AnalyticsEvent"("dedupeKey");
CREATE INDEX "AnalyticsEvent_eventType_occurredAt_idx" ON "AnalyticsEvent"("eventType", "occurredAt");
CREATE INDEX "AnalyticsEvent_listingId_eventType_occurredAt_idx" ON "AnalyticsEvent"("listingId", "eventType", "occurredAt");
CREATE INDEX "AnalyticsEvent_partnerId_eventType_occurredAt_idx" ON "AnalyticsEvent"("partnerId", "eventType", "occurredAt");
CREATE INDEX "AnalyticsEvent_modelId_manufacturingYear_eventType_occurredAt_idx" ON "AnalyticsEvent"("modelId", "manufacturingYear", "eventType", "occurredAt");
CREATE INDEX "AnalyticsEvent_anonymousId_eventType_occurredAt_idx" ON "AnalyticsEvent"("anonymousId", "eventType", "occurredAt");
