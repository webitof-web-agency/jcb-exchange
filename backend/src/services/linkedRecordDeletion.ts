export type LinkedRecordDeletionSource = 'SELL_ACCOUNT' | 'RTO';

export type LinkedRecordDeletionInput = {
  source: LinkedRecordDeletionSource;
  hasLinkedRto: boolean;
  isLocked: boolean;
};

export type LinkedRecordDeletionPolicy =
  | { action: 'BLOCK'; code: 'RTO_HANDOFF_REQUIRED' | 'RECORD_LOCKED'; message: string }
  | { action: 'DELETE_SELL_ACCOUNT' | 'DELETE_RTO' | 'DELETE_LINKED_PAIR' };

export const getLinkedRecordDeletionPolicy = ({ source, hasLinkedRto, isLocked }: LinkedRecordDeletionInput): LinkedRecordDeletionPolicy => {
  if (isLocked) {
    return {
      action: 'BLOCK',
      code: 'RECORD_LOCKED',
      message: 'This record is locked and can only be viewed. Delete it from the RTO Work Status section.',
    };
  }

  if (source === 'SELL_ACCOUNT' && hasLinkedRto) {
    return {
      action: 'BLOCK',
      code: 'RTO_HANDOFF_REQUIRED',
      message: 'This Sell Account was transferred to RTO Work Status. Delete it from the RTO Work Status section first.',
    };
  }

  if (source === 'RTO' && hasLinkedRto) return { action: 'DELETE_LINKED_PAIR' };
  return source === 'RTO' ? { action: 'DELETE_RTO' } : { action: 'DELETE_SELL_ACCOUNT' };
};

export class RtoHandoffRequiredError extends Error {
  readonly code = 'RTO_HANDOFF_REQUIRED';
  readonly statusCode = 409;

  constructor() {
    super('This Sell Account was transferred to RTO Work Status. Delete it from the RTO Work Status section first.');
    this.name = 'RtoHandoffRequiredError';
  }
}
