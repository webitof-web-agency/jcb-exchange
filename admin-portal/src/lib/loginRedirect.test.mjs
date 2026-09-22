import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveLoginRedirect } from './loginRedirect.ts';

test('sends a super admin to the dashboard even when no next route is provided', () => {
  assert.equal(resolveLoginRedirect({ role: 'SUPER_ADMIN' }), '/superadmin/dashboard');
});

test('rejects an external next route and keeps the portal redirect same-origin', () => {
  assert.equal(resolveLoginRedirect({ role: 'SUPER_ADMIN' }, 'https://example.com'), '/superadmin/dashboard');
});

test('keeps an invalid public-site fallback from producing a portal 404', () => {
  assert.equal(resolveLoginRedirect({ role: 'SUPER_ADMIN' }, '/profile'), '/superadmin/dashboard');
});

test('sends an employee to the employee portal dashboard', () => {
  assert.equal(resolveLoginRedirect({ role: 'EMPLOYEE' }), '/employee/dashboard');
});

test('keeps an employee handoff inside the employee portal', () => {
  assert.equal(
    resolveLoginRedirect({ role: 'EMPLOYEE', permissions: ['listings.read'] }, '/employee/listings'),
    '/employee/listings',
  );
});

test('does not allow an employee handoff to target an admin route', () => {
  assert.equal(resolveLoginRedirect({ role: 'EMPLOYEE' }, '/superadmin/listings'), '/employee/dashboard');
});

test('sends an employee without dashboard permission to the first accessible page', () => {
  assert.equal(
    resolveLoginRedirect({ role: 'EMPLOYEE', permissions: ['partners.read'] }, '/employee/dashboard'),
    '/employee/partners',
  );
});
