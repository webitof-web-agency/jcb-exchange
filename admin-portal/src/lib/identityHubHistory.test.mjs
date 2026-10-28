import assert from 'node:assert/strict';
import test from 'node:test';
import { dedupeIdentityHistoryRecords } from './identityHubHistory.mjs';

test('keeps separate PAN history records for the same identifier', () => {
  const records = [
    { _type: 'PAN', id: 'record-new', operation: 'PAN_COMPREHENSIVE_V2', maskedPan: 'ABCDE****F' },
    { _type: 'PAN', id: 'record-template', operation: 'PAN_COMPREHENSIVE_V2', maskedPan: 'ABCDE****F', template: { id: 'template-1' } },
    { _type: 'PAN', id: 'record-new', operation: 'PAN_COMPREHENSIVE_V2', maskedPan: 'ABCDE****F' },
  ];

  assert.deepEqual(dedupeIdentityHistoryRecords(records), records.slice(0, 2));
});
