import assert from 'node:assert/strict';
import test from 'node:test';
import { formatAiTimestamp, normalizeAiDisplayText } from './aiDisplay';

test('formats provider timestamps in the operator date format', () => {
  assert.equal(
    formatAiTimestamp('2026-11-13T07:20:06.747Z'),
    '13/11/2026 12:50 PM',
  );
});

test('returns an empty value for invalid provider timestamps', () => {
  assert.equal(formatAiTimestamp('not-a-date'), '');
});

test('normalizes raw timestamps in previously stored assistant messages', () => {
  assert.equal(
    normalizeAiDisplayText('Fetched at 2026-11-13T07:20:06.747Z.'),
    'Fetched at 13/11/2026 12:50 PM.',
  );
});

test('hides UUID and Mongo ObjectId values from previously stored AI messages', () => {
  const normalized = normalizeAiDisplayText(
    'Lead ID: 32e28d69-5b6e-41b8-a1dd-850528f6ad09; record 507f1f77bcf86cd799439011.',
  );

  assert.equal(normalized.includes('32e28d69-5b6e-41b8-a1dd-850528f6ad09'), false);
  assert.equal(normalized.includes('507f1f77bcf86cd799439011'), false);
  assert.match(normalized, /\[REDACTED_INTERNAL_ID\]/g);
});

test('hides non-UUID values when an AI message labels them as entity IDs', () => {
  const normalized = normalizeAiDisplayText('Lead ID: 12345 and Listing ID: LST-0099.');

  assert.equal(normalized.includes('12345'), false);
  assert.equal(normalized.includes('LST-0099'), false);
});
