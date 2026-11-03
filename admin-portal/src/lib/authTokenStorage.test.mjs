import assert from 'node:assert/strict';
import test from 'node:test';

import { resolvePortalAuthToken } from './authTokenStorage.mjs';

test('uses the persisted portal token when the in-memory auth store is empty', () => {
  const storage = {
    getItem: (key) => (key === 'portal_token' ? 'persisted-token' : null),
  };

  assert.equal(resolvePortalAuthToken(null, storage), 'persisted-token');
});

test('prefers the current in-memory token over persisted session data', () => {
  const storage = {
    getItem: () => 'old-token',
  };

  assert.equal(resolvePortalAuthToken('current-token', storage), 'current-token');
});
