-- Phase 4: additive AI conversation history.
-- This migration adds only new tables and indexes; existing records are untouched.

CREATE TYPE "AiConversationStatus" AS ENUM ('ACTIVE', 'ARCHIVED');
CREATE TYPE "AiConversationMessageRole" AS ENUM ('USER', 'ASSISTANT');

CREATE TABLE "AiConversation" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "status" "AiConversationStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastMessageAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiConversation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiConversationMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" "AiConversationMessageRole" NOT NULL,
    "contentRedacted" TEXT NOT NULL,
    "contentHash" VARCHAR(128) NOT NULL,
    "contentHmac" VARCHAR(128),
    "requestId" TEXT,
    "provider" VARCHAR(40),
    "modelAlias" VARCHAR(120),
    "toolName" VARCHAR(100),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiConversationMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AiConversationMessage_requestId_key" ON "AiConversationMessage"("requestId");
CREATE INDEX "AiConversation_actorUserId_updatedAt_idx" ON "AiConversation"("actorUserId", "updatedAt");
CREATE INDEX "AiConversation_actorUserId_status_updatedAt_idx" ON "AiConversation"("actorUserId", "status", "updatedAt");
CREATE INDEX "AiConversationMessage_conversationId_createdAt_idx" ON "AiConversationMessage"("conversationId", "createdAt");
CREATE INDEX "AiConversationMessage_conversationId_role_createdAt_idx" ON "AiConversationMessage"("conversationId", "role", "createdAt");

ALTER TABLE "AiConversation" ADD CONSTRAINT "AiConversation_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AiConversationMessage" ADD CONSTRAINT "AiConversationMessage_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "AiConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
