import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeListingImageAnalysis } from './aiVision.service';

test('normalizes bounded listing image quality output and discards unsafe fields', () => {
  const result = normalizeListingImageAnalysis({
    qualityScore: 132,
    isMachine: true,
    issues: ['blur', 'blur', 'password: secret'],
    suggestedSlot: 'front-right',
    internalId: 'should-not-leak',
  });

  assert.deepEqual(result, {
    qualityScore: 100,
    isMachine: true,
    issues: ['blur', '[REDACTED_SECRET]'],
    suggestedSlot: 'FRONT_RIGHT',
  });
  assert.equal('internalId' in result, false);
});
