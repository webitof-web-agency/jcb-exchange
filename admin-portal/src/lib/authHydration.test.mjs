import test from 'node:test';
import assert from 'node:assert/strict';

import { isAuthReady } from './authHydration.js';

test('does not allow protected requests before auth hydration completes', () => {
  assert.equal(isAuthReady(false, false), false);
  assert.equal(isAuthReady(false, true), false);
  assert.equal(isAuthReady(true, false), false);
  assert.equal(isAuthReady(true, true), true);
});
