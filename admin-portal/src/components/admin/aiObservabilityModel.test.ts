import test from 'node:test';
import assert from 'node:assert/strict';
import { availabilityLabel, formatLatency } from './aiObservabilityModel';

test('formats AI latency for a compact operational card', () => {
  assert.equal(formatLatency(0), '0 ms');
  assert.equal(formatLatency(1214), '1.2 s');
  assert.equal(formatLatency(2500), '2.5 s');
});

test('uses explicit availability labels for audit rows', () => {
  assert.equal(availabilityLabel('AVAILABLE'), 'Data available');
  assert.equal(availabilityLabel('UNAVAILABLE'), 'Data unavailable');
  assert.equal(availabilityLabel(null), 'Not reported');
});
