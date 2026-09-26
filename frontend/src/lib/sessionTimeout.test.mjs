import assert from 'node:assert/strict';
import test from 'node:test';
import { getIdleTimeoutMs, getWarningTimeoutMs } from './sessionTimeout.mjs';

test('uses the configured idle timeout in minutes', () => {
  assert.equal(getIdleTimeoutMs('15'), 15 * 60 * 1000);
});

test('falls back to fifteen minutes for invalid timeout configuration', () => {
  assert.equal(getIdleTimeoutMs('invalid'), 15 * 60 * 1000);
  assert.equal(getIdleTimeoutMs('0'), 15 * 60 * 1000);
});

test('keeps the warning shorter than the configured timeout', () => {
  assert.equal(getWarningTimeoutMs(15 * 60 * 1000), 60 * 1000);
  assert.equal(getWarningTimeoutMs(30 * 1000), 10 * 1000);
});
