export class RecordLockedError extends Error {
  readonly code = 'RECORD_LOCKED';
  readonly statusCode = 423;

  constructor() {
    super('This record is locked and can only be viewed.');
    this.name = 'RecordLockedError';
  }
}

export const assertRecordEditable = (isLocked: unknown) => {
  if (isLocked === true) throw new RecordLockedError();
};

export const assertDealDoneBeforeLock = (status: unknown) => {
  const normalized = String(status ?? '').trim().toUpperCase().replace(/\s+/g, '_');
  if (normalized !== 'DEAL_DONE') {
    throw new Error('Only records with Deal Done status can be locked.');
  }
};
