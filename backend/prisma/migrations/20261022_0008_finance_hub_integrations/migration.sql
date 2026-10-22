-- CreateTable
CREATE TABLE "FinIntegrationEvent" (
    "id" TEXT NOT NULL,
    "provider" VARCHAR(30) NOT NULL,
    "eventType" VARCHAR(40) NOT NULL,
    "externalId" VARCHAR(100) NOT NULL,
    "amount" DECIMAL(14,2),
    "eventDate" DATE,
    "reference" VARCHAR(100),
    "payerName" TEXT,
    "payload" JSONB NOT NULL,
    "status" VARCHAR(12) NOT NULL DEFAULT 'RECEIVED',
    "voucherId" TEXT,
    "note" TEXT,
    "handledById" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinIntegrationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FinIntegrationEvent_status_receivedAt_idx" ON "FinIntegrationEvent"("status", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "FinIntegrationEvent_provider_externalId_key" ON "FinIntegrationEvent"("provider", "externalId");

