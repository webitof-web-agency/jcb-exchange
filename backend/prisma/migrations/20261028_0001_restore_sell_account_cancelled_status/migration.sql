-- Preserve legacy Sold Vehicle rows that use the CANCELLED status.
ALTER TYPE "SellAccountDealStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';
