-- Phase 8: additive audit HMAC columns. Existing AI records remain valid and untouched.
ALTER TABLE "AiRun" ADD COLUMN "promptHmac" VARCHAR(128);
ALTER TABLE "AiRun" ADD COLUMN "responseHmac" VARCHAR(128);
ALTER TABLE "AiToolCall" ADD COLUMN "argumentsHmac" VARCHAR(128);
ALTER TABLE "AiToolCall" ADD COLUMN "resultHmac" VARCHAR(128);
ALTER TABLE "AiFeedback" ADD COLUMN "commentHmac" VARCHAR(128);
ALTER TABLE "AiActionProposal" ADD COLUMN "payloadHmac" VARCHAR(128);
