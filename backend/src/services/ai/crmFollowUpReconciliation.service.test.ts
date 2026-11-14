import assert from 'node:assert/strict';
import test from 'node:test';
import { reconcileCrmFollowUps } from './crmFollowUpReconciliation.service';

test('flags contradictory DONE/MISSED timestamps without changing the source status', () => {
  const result = reconcileCrmFollowUps([
    { status: 'DONE', dueAt: '2026-11-13T10:00:00.000Z', completedAt: '2026-11-14T10:00:00.000Z', missedAt: '2026-11-13T11:00:00.000Z', updatedAt: '2026-11-14T10:00:00.000Z' },
    { status: 'MISSED', dueAt: '2026-11-12T10:00:00.000Z', completedAt: '2026-11-13T10:00:00.000Z', missedAt: '2026-11-12T11:00:00.000Z', updatedAt: '2026-11-14T10:00:00.000Z' },
    { status: 'DONE', dueAt: '2026-11-12T10:00:00.000Z', completedAt: '2026-11-14T10:00:00.000Z', missedAt: null, updatedAt: '2026-11-14T10:00:00.000Z' },
  ]);

  assert.equal(result.conflictCount, 2);
  assert.equal(result.doneLateCount, 2);
  assert.equal(result.conflicts[0]?.status, 'DONE');
  assert.equal(result.conflicts[1]?.status, 'MISSED');
  assert.match(result.rule, /DONE.*MISSED/u);
});
