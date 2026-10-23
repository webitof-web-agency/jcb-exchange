import assert from 'node:assert/strict';
import test from 'node:test';
import { getAuthUniqueConstraintMessage } from './authUniqueConstraint';

test('maps a registration email unique conflict to a safe user-facing message', () => {
  assert.equal(
    getAuthUniqueConstraintMessage(
      { code: 'P2002', meta: { target: ['email'] } },
      'register',
    ),
    'Email address is already registered.',
  );
});

test('maps a profile email unique conflict without exposing database details', () => {
  assert.equal(
    getAuthUniqueConstraintMessage(
      { code: 'P2002', meta: { target: ['User_email_key'] } },
      'profile',
    ),
    'Email address is already in use.',
  );
});

test('maps an admin-managed email unique conflict to the same safe message', () => {
  assert.equal(
    getAuthUniqueConstraintMessage(
      { code: 'P2002', meta: { target: ['email'] } },
      'admin',
    ),
    'Email address is already in use.',
  );
});

test('returns no auth conflict message for unrelated errors', () => {
  assert.equal(getAuthUniqueConstraintMessage({ code: 'P2025' }, 'register'), null);
});
