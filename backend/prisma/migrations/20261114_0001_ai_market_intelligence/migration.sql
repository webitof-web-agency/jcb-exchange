CREATE TABLE "AiMarketInsight" (
    "id" TEXT NOT NULL,
    "sourceKey" VARCHAR(80) NOT NULL,
    "sourceName" VARCHAR(160) NOT NULL,
    "sourceCategory" VARCHAR(30) NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "summary" VARCHAR(1200) NOT NULL,
    "sourceUrl" VARCHAR(2000) NOT NULL,
    "sourcePublishedAt" TIMESTAMP(3),
    "impact" VARCHAR(20) NOT NULL,
    "priority" VARCHAR(20) NOT NULL,
    "recommendation" VARCHAR(1200) NOT NULL,
    "contentHash" VARCHAR(128) NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiMarketInsight_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AiMarketInsight_sourceKey_contentHash_key" ON "AiMarketInsight"("sourceKey", "contentHash");
CREATE INDEX "AiMarketInsight_priority_sourcePublishedAt_idx" ON "AiMarketInsight"("priority", "sourcePublishedAt");
CREATE INDEX "AiMarketInsight_sourceCategory_observedAt_idx" ON "AiMarketInsight"("sourceCategory", "observedAt");
