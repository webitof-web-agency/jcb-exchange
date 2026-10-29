import assert from 'node:assert/strict';
import test from 'node:test';
import { hasPersistedVerificationPreview } from './verificationHistoryPreview.mjs';

test('restores a saved verification when raw result was purged after template upload', () => {
  assert.equal(hasPersistedVerificationPreview({
    result: null,
    record: { id: 'aadhaar-1', template: { id: 'template-1', mimeType: 'image/png' } },
    template: null,
  }), true);
});

test('restores a live verification while its raw result is still available', () => {
  assert.equal(hasPersistedVerificationPreview({ result: { fullName: 'Example' }, record: {} }), true);
});

test('does not create a preview when both raw result and saved template are missing', () => {
  assert.equal(hasPersistedVerificationPreview({ result: null, record: { id: 'pan-1' }, template: null }), false);
  assert.equal(hasPersistedVerificationPreview(null), false);
});
