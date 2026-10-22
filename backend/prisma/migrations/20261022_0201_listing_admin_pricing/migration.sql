-- Listing admin pricing: additive only. "price" stays the seller's price; buyers see
-- price + adminMarginAmount + adminExpenseAmount once a listing is approved.
-- AlterTable
ALTER TABLE "Listing" ADD COLUMN     "adminMarginAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "adminExpenseAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "adminExpenseBreakdown" JSONB,
ADD COLUMN     "pricingUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "pricingUpdatedById" TEXT;

-- Sell account margin basis: existing records keep the old margin (sell - purchase);
-- new and edited records use sell - purchase - expenses.
-- CreateEnum
CREATE TYPE "SellAccountMarginBasis" AS ENUM ('SALE_MINUS_PURCHASE', 'AFTER_EXPENSES');

-- AlterTable
ALTER TABLE "SellAccount" ADD COLUMN     "marginBasis" "SellAccountMarginBasis" NOT NULL DEFAULT 'SALE_MINUS_PURCHASE';
ALTER TABLE "SellAccount" ALTER COLUMN "marginBasis" SET DEFAULT 'AFTER_EXPENSES';
