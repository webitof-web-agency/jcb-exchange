import assert from 'node:assert/strict';
import test from 'node:test';
import { createSingleFlight } from './authHandoff.mjs';

test('runs the handoff request only once when the effect is replayed', async () => {
  let callCount = 0;
  const run = createSingleFlight(async () => {
    callCount += 1;
    return 'completed';
  });

  const firstRun = run();
  const secondRun = run();

  assert.strictEqual(firstRun, secondRun);
  assert.equal(await firstRun, 'completed');
  assert.equal(callCount, 1);
});
