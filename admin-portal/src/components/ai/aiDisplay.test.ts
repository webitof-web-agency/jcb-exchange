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
