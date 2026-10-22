-- CreateEnum
CREATE TYPE "FinQueryStatus" AS ENUM ('OPEN', 'ANSWERED', 'CLOSED');

-- CreateTable
CREATE TABLE "FinVaultDocument" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" VARCHAR(60) NOT NULL,
    "financialYear" VARCHAR(20),
    "period" VARCHAR(7),
    "fileUrl" TEXT NOT NULL,
    "fileName" TEXT,
    "mimeType" VARCHAR(120),
    "size" INTEGER,
    "version" INTEGER NOT NULL DEFAULT 1,
    "previousId" TEXT,
    "entityType" VARCHAR(40),
    "entityId" VARCHAR(60),
    "expiresAt" DATE,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinVaultDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinCloseChecklist" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "signedOffById" TEXT,
    "signedOffAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinCloseChecklist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinYearClose" (
    "id" TEXT NOT NULL,
    "yearId" TEXT NOT NULL,
    "voucherId" TEXT NOT NULL,
    "profit" DECIMAL(14,2) NOT NULL,
    "closedById" TEXT,
    "closedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reopenedAt" TIMESTAMP(3),
    "reopenedById" TEXT,

    CONSTRAINT "FinYearClose_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinCaQuery" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" VARCHAR(60),
    "priority" VARCHAR(10) NOT NULL DEFAULT 'NORMAL',
    "status" "FinQueryStatus" NOT NULL DEFAULT 'OPEN',
    "financialYear" VARCHAR(20),
    "entityType" VARCHAR(40),
    "entityId" VARCHAR(60),
    "dueDate" DATE,
    "raisedById" TEXT,
    "assignedToId" TEXT,
    "responses" JSONB NOT NULL DEFAULT '[]',
    "closedById" TEXT,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinCaQuery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinVoucherReview" (
    "id" TEXT NOT NULL,
    "voucherId" TEXT NOT NULL,
    "status" VARCHAR(12) NOT NULL,
    "note" TEXT,
    "queryId" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinVoucherReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinImportBatch" (
    "id" TEXT NOT NULL,
    "kind" VARCHAR(30) NOT NULL,
    "fileName" TEXT,
    "dryRun" BOOLEAN NOT NULL DEFAULT false,
    "totalRows" INTEGER NOT NULL,
    "created" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "errors" JSONB NOT NULL DEFAULT '[]',
    "results" JSONB NOT NULL DEFAULT '[]',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FinVaultDocument_category_financialYear_idx" ON "FinVaultDocument"("category", "financialYear");

-- CreateIndex
CREATE INDEX "FinVaultDocument_entityType_entityId_idx" ON "FinVaultDocument"("entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "FinCloseChecklist_periodId_key" ON "FinCloseChecklist"("periodId");

-- CreateIndex
CREATE UNIQUE INDEX "FinYearClose_yearId_key" ON "FinYearClose"("yearId");

-- CreateIndex
CREATE UNIQUE INDEX "FinYearClose_voucherId_key" ON "FinYearClose"("voucherId");

-- CreateIndex
CREATE INDEX "FinCaQuery_status_dueDate_idx" ON "FinCaQuery"("status", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "FinVoucherReview_voucherId_key" ON "FinVoucherReview"("voucherId");

-- CreateIndex
CREATE INDEX "FinImportBatch_kind_createdAt_idx" ON "FinImportBatch"("kind", "createdAt");

