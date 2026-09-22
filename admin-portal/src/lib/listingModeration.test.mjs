import test from 'node:test';
import assert from 'node:assert/strict';
import { getPendingModerationOptions, getModerationStatus } from './listingModeration.mjs';

test('exposes approve and reject actions for pending listings', () => {
  assert.deepEqual(getPendingModerationOptions(), ['APPROVE', 'REJECT']);
  assert.equal(getModerationStatus('APPROVE'), 'PUBLISHED');
  assert.equal(getModerationStatus('REJECT'), 'CHANGES_REQUESTED');
});
