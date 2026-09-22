import test from 'node:test';
import assert from 'node:assert/strict';
import { findLocationOptionId, normalizeLocationOptions } from './locationSelection.mjs';

test('matches saved state and city names regardless of casing or whitespace', () => {
  const options = normalizeLocationOptions([
    { id: 10, name: ' Maharashtra ' },
    { id: 11, name: 'Pune' },
  ]);

  assert.equal(findLocationOptionId(options, 'maharashtra'), '10');
  assert.equal(findLocationOptionId(options, ' PUNE '), '11');
});

test('ignores malformed database location rows', () => {
  assert.deepEqual(
    normalizeLocationOptions([
      { id: 10, name: 'Maharashtra' },
      { id: null, name: 'Invalid' },
      { id: 11, name: '' },
      null,
    ]),
    [{ id: 10, name: 'Maharashtra' }],
  );
});
