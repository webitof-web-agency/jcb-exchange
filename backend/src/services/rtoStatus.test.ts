import assert from 'node:assert/strict';
import test from 'node:test';
import { RtoWorkStatus } from '@prisma/client';
import { normalizeRtoWorkStatus, statusForSellAccountHandoff } from './rtoStatus';

test('normalizes legacy pending RTO records to work in progress', () => {
  assert.equal(normalizeRtoWorkStatus(RtoWorkStatus.PENDING), RtoWorkStatus.RTO_WORK_IN_PROGRESS);
  assert.equal(normalizeRtoWorkStatus(' in_progress '), RtoWorkStatus.RTO_WORK_IN_PROGRESS);
});

test('uses work in progress as the safe fallback for missing or invalid status', () => {
  assert.equal(normalizeRtoWorkStatus(''), RtoWorkStatus.RTO_WORK_IN_PROGRESS);
  assert.equal(normalizeRtoWorkStatus('UNKNOWN'), RtoWorkStatus.RTO_WORK_IN_PROGRESS);
});

test('maps every legacy status to one of the five canonical workflow statuses', () => {
  assert.equal(normalizeRtoWorkStatus(RtoWorkStatus.DOCUMENT_REQUIRED), RtoWorkStatus.RTO_WORK_STARTED);
  assert.equal(normalizeRtoWorkStatus(RtoWorkStatus.SUBMITTED), RtoWorkStatus.RTO_WORK_STARTED);
  assert.equal(normalizeRtoWorkStatus(RtoWorkStatus.APPROVED), RtoWorkStatus.RTO_WORK_STARTED);
  assert.equal(normalizeRtoWorkStatus(RtoWorkStatus.REJECTED), RtoWorkStatus.RTO_WORK_FAILED);
  assert.equal(normalizeRtoWorkStatus(RtoWorkStatus.CANCELLED), RtoWorkStatus.RTO_WORK_FAILED);
  assert.equal(normalizeRtoWorkStatus(RtoWorkStatus.COMPLETED), RtoWorkStatus.RTO_WORK_COMPLETED);
  assert.equal(normalizeRtoWorkStatus(RtoWorkStatus.DEAL_DONE), RtoWorkStatus.DEAL_DONE);
});

test('promotes only an active in-progress record when handed off from Sell Account', () => {
  assert.equal(statusForSellAccountHandoff(RtoWorkStatus.PENDING), RtoWorkStatus.RTO_WORK_STARTED);
  assert.equal(statusForSellAccountHandoff(RtoWorkStatus.RTO_WORK_IN_PROGRESS), RtoWorkStatus.RTO_WORK_STARTED);
  assert.equal(statusForSellAccountHandoff(RtoWorkStatus.RTO_WORK_STARTED), RtoWorkStatus.RTO_WORK_STARTED);
  assert.equal(statusForSellAccountHandoff(RtoWorkStatus.RTO_WORK_FAILED), RtoWorkStatus.RTO_WORK_FAILED);
  assert.equal(statusForSellAccountHandoff(RtoWorkStatus.RTO_WORK_COMPLETED), RtoWorkStatus.RTO_WORK_COMPLETED);
  assert.equal(statusForSellAccountHandoff(RtoWorkStatus.DEAL_DONE), RtoWorkStatus.DEAL_DONE);
});
