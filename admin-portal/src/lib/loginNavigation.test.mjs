import assert from 'node:assert/strict';
import test from 'node:test';

import { navigateToAuthenticatedPortal } from './loginNavigation.mjs';

test('navigates authenticated users without forcing a full page reload', () => {
  const calls = [];
  const router = {
    replace: (destination) => calls.push(destination),
  };

  assert.equal(navigateToAuthenticatedPortal(router, '/admin/dashboard'), true);
  assert.deepEqual(calls, ['/admin/dashboard']);
});

test('does not navigate when no authenticated destination is available', () => {
  const calls = [];
  const router = {
    replace: (destination) => calls.push(destination),
  };

  assert.equal(navigateToAuthenticatedPortal(router, null), false);
  assert.deepEqual(calls, []);
});
