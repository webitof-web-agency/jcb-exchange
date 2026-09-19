import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveLoginRedirect } from './loginRedirect.ts';

test('sends a super admin to the dashboard even when no next route is provided', () => {
  assert.equal(resolveLoginRedirect({ role: 'SUPER_ADMIN' }), '/superadmin/dashboard');
});

test('rejects an external next route and keeps the portal redirect same-origin', () => {
  assert.equal(resolveLoginRedirect({ role: 'SUPER_ADMIN' }, 'https://example.com'), '/superadmin/dashboard');
});
