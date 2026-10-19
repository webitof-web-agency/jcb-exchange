-- Add canonical RTO workflow values without removing legacy enum values.
-- Existing rows remain untouched and are normalized at the API boundary.
ALTER TYPE "RtoWorkStatus" ADD VALUE IF NOT EXISTS 'RTO_WORK_STARTED';
ALTER TYPE "RtoWorkStatus" ADD VALUE IF NOT EXISTS 'RTO_WORK_IN_PROGRESS';
ALTER TYPE "RtoWorkStatus" ADD VALUE IF NOT EXISTS 'RTO_WORK_FAILED';
ALTER TYPE "RtoWorkStatus" ADD VALUE IF NOT EXISTS 'RTO_WORK_COMPLETED';
ALTER TYPE "RtoWorkStatus" ADD VALUE IF NOT EXISTS 'DEAL_DONE';
