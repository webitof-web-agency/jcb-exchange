-- Phase 5: persist standalone read-only tool availability for audit and latency monitoring.
ALTER TABLE "AiToolCall"
  ADD COLUMN "dataAvailability" VARCHAR(20);
