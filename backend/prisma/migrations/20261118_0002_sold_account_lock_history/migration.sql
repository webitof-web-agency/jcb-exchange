CREATE TYPE "SellAccountLockAction" AS ENUM ('LOCK', 'UNLOCK');

CREATE TABLE "SellAccountLockHistory" (
  "id" TEXT NOT NULL,
  "sellAccountId" TEXT NOT NULL,
  "action" "SellAccountLockAction" NOT NULL,
  "actorId" TEXT,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SellAccountLockHistory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SellAccountLockHistory_sellAccountId_createdAt_idx" ON "SellAccountLockHistory"("sellAccountId", "createdAt");
CREATE INDEX "SellAccountLockHistory_action_createdAt_idx" ON "SellAccountLockHistory"("action", "createdAt");

ALTER TABLE "SellAccountLockHistory"
  ADD CONSTRAINT "SellAccountLockHistory_sellAccountId_fkey"
  FOREIGN KEY ("sellAccountId") REFERENCES "SellAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
