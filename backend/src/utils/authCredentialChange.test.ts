import assert from 'node:assert/strict';
import test from 'node:test';
import { hasAuthCredentialChange } from './authCredentialChange';

test('detects email changes that require a refreshed session token', () => {
  assert.equal(hasAuthCredentialChange({ currentEmail: 'old@example.com', nextEmail: 'new@example.com', currentMobile: '9876543210', nextMobile: '9876543210' }), true);
});

test('does not rotate the session when credentials are unchanged', () => {
  assert.equal(hasAuthCredentialChange({ currentEmail: 'user@example.com', nextEmail: 'user@example.com', currentMobile: '9876543210', nextMobile: '9876543210' }), false);
});
