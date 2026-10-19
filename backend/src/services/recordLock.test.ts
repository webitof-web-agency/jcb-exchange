import assert from 'node:assert/strict';
import test from 'node:test';
import { assertDealDoneBeforeLock, assertRecordEditable, RecordLockedError } from './recordLock';

test('only Deal Done records can be locked', () => {
  assert.doesNotThrow(() => assertDealDoneBeforeLock('DEAL_DONE'));
  assert.throws(() => assertDealDoneBeforeLock('RTO_WORK_COMPLETED'), /Deal Done/);
});

test('locked records reject further edits with a lock-specific error', () => {
  assert.doesNotThrow(() => assertRecordEditable(false));
  assert.throws(() => assertRecordEditable(true), (error: unknown) => {
    return error instanceof RecordLockedError && error.statusCode === 423;
  });
});
