import assert from 'node:assert/strict';
import test from 'node:test';

import { isDefinitiveSessionFailure } from './sessionAccessPolicy.mjs';

test('does not invalidate a session for transient network or server failures', () => {
  assert.equal(isDefinitiveSessionFailure({}), false);
  assert.equal(isDefinitiveSessionFailure({ response: { status: 500 } }), false);
  assert.equal(isDefinitiveSessionFailure({ code: 'ECONNABORTED' }), false);
});

test('invalidates a session only for confirmed authentication or account failures', () => {
  assert.equal(isDefinitiveSessionFailure({ response: { status: 401 } }), true);
  assert.equal(
    isDefinitiveSessionFailure({ response: { status: 403, data: { code: 'SESSION_REVOKED' } } }),
    true,
  );
  assert.equal(
    isDefinitiveSessionFailure({ response: { status: 403, data: { code: 'ACCOUNT_INACTIVE' } } }),
    true,
  );
  assert.equal(
    isDefinitiveSessionFailure({ response: { status: 403, data: { error: 'Insufficient permissions' } } }),
    false,
  );
  assert.equal(
    isDefinitiveSessionFailure({ response: { status: 403, data: { error: 'Permission revoked' } } }),
    false,
  );
});
