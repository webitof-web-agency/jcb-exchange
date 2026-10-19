import { RtoWorkStatus } from '@prisma/client';

const validRtoStatuses = new Set<string>(Object.values(RtoWorkStatus));

const legacyStatusMap: Record<string, RtoWorkStatus> = {
  PENDING: RtoWorkStatus.RTO_WORK_IN_PROGRESS,
  IN_PROGRESS: RtoWorkStatus.RTO_WORK_IN_PROGRESS,
  DOCUMENT_REQUIRED: RtoWorkStatus.RTO_WORK_STARTED,
  SUBMITTED: RtoWorkStatus.RTO_WORK_STARTED,
  APPROVED: RtoWorkStatus.RTO_WORK_STARTED,
  REJECTED: RtoWorkStatus.RTO_WORK_FAILED,
  CANCELLED: RtoWorkStatus.RTO_WORK_FAILED,
  COMPLETED: RtoWorkStatus.RTO_WORK_COMPLETED,
  RTO_WORK_STARTED: RtoWorkStatus.RTO_WORK_STARTED,
  RTO_WORK_IN_PROGRESS: RtoWorkStatus.RTO_WORK_IN_PROGRESS,
  RTO_WORK_FAILED: RtoWorkStatus.RTO_WORK_FAILED,
  RTO_WORK_COMPLETED: RtoWorkStatus.RTO_WORK_COMPLETED,
  DEAL_DONE: RtoWorkStatus.DEAL_DONE,
};

export const rtoStatusStorageValues: Record<RtoWorkStatus, RtoWorkStatus[]> = {
  [RtoWorkStatus.RTO_WORK_STARTED]: [
    RtoWorkStatus.RTO_WORK_STARTED,
    RtoWorkStatus.DOCUMENT_REQUIRED,
    RtoWorkStatus.SUBMITTED,
    RtoWorkStatus.APPROVED,
  ],
  [RtoWorkStatus.RTO_WORK_IN_PROGRESS]: [
    RtoWorkStatus.RTO_WORK_IN_PROGRESS,
    RtoWorkStatus.PENDING,
    RtoWorkStatus.IN_PROGRESS,
  ],
  [RtoWorkStatus.RTO_WORK_FAILED]: [
    RtoWorkStatus.RTO_WORK_FAILED,
    RtoWorkStatus.REJECTED,
    RtoWorkStatus.CANCELLED,
  ],
  [RtoWorkStatus.RTO_WORK_COMPLETED]: [
    RtoWorkStatus.RTO_WORK_COMPLETED,
    RtoWorkStatus.COMPLETED,
  ],
  [RtoWorkStatus.DEAL_DONE]: [RtoWorkStatus.DEAL_DONE],
  [RtoWorkStatus.PENDING]: [RtoWorkStatus.PENDING],
  [RtoWorkStatus.IN_PROGRESS]: [RtoWorkStatus.IN_PROGRESS],
  [RtoWorkStatus.DOCUMENT_REQUIRED]: [RtoWorkStatus.DOCUMENT_REQUIRED],
  [RtoWorkStatus.SUBMITTED]: [RtoWorkStatus.SUBMITTED],
  [RtoWorkStatus.APPROVED]: [RtoWorkStatus.APPROVED],
  [RtoWorkStatus.REJECTED]: [RtoWorkStatus.REJECTED],
  [RtoWorkStatus.COMPLETED]: [RtoWorkStatus.COMPLETED],
  [RtoWorkStatus.CANCELLED]: [RtoWorkStatus.CANCELLED],
};

export const normalizeRtoWorkStatus = (value: unknown): RtoWorkStatus => {
  const normalized = String(value ?? '').trim().toUpperCase();
  if (legacyStatusMap[normalized]) return legacyStatusMap[normalized];
  return validRtoStatuses.has(normalized)
    ? normalized as RtoWorkStatus
    : RtoWorkStatus.RTO_WORK_IN_PROGRESS;
};

/**
 * A Sell Account handoff is the explicit boundary at which RTO work starts.
 * Older/listing-created records may still be pending or in progress, so only
 * that non-terminal state is promoted. Failed, completed, and deal-done
 * records are intentionally preserved and never regressed by a re-handoff.
 */
export const statusForSellAccountHandoff = (value: unknown): RtoWorkStatus => {
  const normalized = normalizeRtoWorkStatus(value);
  return normalized === RtoWorkStatus.RTO_WORK_IN_PROGRESS
    ? RtoWorkStatus.RTO_WORK_STARTED
    : normalized;
};
