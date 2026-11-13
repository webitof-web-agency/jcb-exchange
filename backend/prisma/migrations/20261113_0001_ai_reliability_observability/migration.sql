-- Phase 6: additive reliability telemetry.
-- This table stores allow-listed metrics only; it intentionally has no
-- message, prompt, response, token, credential, URL, or provider payload field.
CREATE TABLE "AiReliabilityEvent" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT,
    "eventType" VARCHAR(30) NOT NULL,
    "module" VARCHAR(80),
    "toolName" VARCHAR(100),
    "provider" VARCHAR(40),
    "status" VARCHAR(20) NOT NULL,
    "latencyMs" INTEGER,
    "databaseLatencyMs" INTEGER,
    "surepassLatencyMs" INTEGER,
    "permissionDenied" BOOLEAN NOT NULL DEFAULT false,
    "clarification" BOOLEAN NOT NULL DEFAULT false,
    "emptyData" BOOLEAN NOT NULL DEFAULT false,
    "providerFailure" BOOLEAN NOT NULL DEFAULT false,
    "forecastConfidence" INTEGER,
    "errorCode" VARCHAR(100),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiReliabilityEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AiReliabilityEvent_createdAt_idx" ON "AiReliabilityEvent"("createdAt");
CREATE INDEX "AiReliabilityEvent_eventType_createdAt_idx" ON "AiReliabilityEvent"("eventType", "createdAt");
CREATE INDEX "AiReliabilityEvent_module_toolName_createdAt_idx" ON "AiReliabilityEvent"("module", "toolName", "createdAt");
CREATE INDEX "AiReliabilityEvent_status_createdAt_idx" ON "AiReliabilityEvent"("status", "createdAt");

ALTER TABLE "AiReliabilityEvent"
  ADD CONSTRAINT "AiReliabilityEvent_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
