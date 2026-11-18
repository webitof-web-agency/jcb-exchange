-- Persist only the bounded read-only selector used for follow-up routing.
-- The API never returns this internal context as conversation history.
ALTER TABLE "AiConversationMessage"
  ADD COLUMN "toolArguments" JSONB;
