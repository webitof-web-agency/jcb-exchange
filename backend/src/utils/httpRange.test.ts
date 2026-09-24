import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSingleByteRange } from './httpRange';

test('parses an open-ended byte range against the known media size', () => {
  assert.deepEqual(parseSingleByteRange('bytes=0-1023', 5079167), {
    start: 0,
    end: 1023,
    length: 1024,
    total: 5079167,
  });
});

test('clamps an open-ended range to the media size', () => {
  assert.deepEqual(parseSingleByteRange('bytes=5079000-', 5079167), {
    start: 5079000,
    end: 5079166,
    length: 167,
    total: 5079167,
  });
});

test('rejects unsupported or invalid ranges', () => {
  assert.equal(parseSingleByteRange('bytes=0-10,20-30', 100), null);
  assert.equal(parseSingleByteRange('bytes=100-120', 100), null);
});
