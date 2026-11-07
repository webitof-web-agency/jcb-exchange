ALTER TABLE "User"
ADD COLUMN "archivedAt" TIMESTAMP(3),
ADD COLUMN "archiveReason" TEXT,
ADD COLUMN "archivedById" TEXT,
ADD COLUMN "archivedFromStatus" "UserStatus",
ADD COLUMN "restoredAt" TIMESTAMP(3),
ADD COLUMN "restoredById" TEXT;

CREATE INDEX "User_role_status_archivedAt_updatedAt_idx"
ON "User"("role", "status", "archivedAt", "updatedAt");
