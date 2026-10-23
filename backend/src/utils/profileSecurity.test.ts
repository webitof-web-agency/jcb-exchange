import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeProfileEmail,
  validatePasswordChangeInput,
} from './profileSecurity';

test('normalizes a valid profile email and rejects malformed email input', () => {
  assert.equal(normalizeProfileEmail('  User@Example.COM '), 'user@example.com');
  assert.throws(() => normalizeProfileEmail('not-an-email'), /valid email/i);
});

test('requires matching strong passwords when setting a password', () => {
  assert.equal(
    validatePasswordChangeInput({ newPassword: 'secure-pass-123', confirmPassword: 'secure-pass-123' }),
    null,
  );
  assert.match(
    validatePasswordChangeInput({ newPassword: 'short', confirmPassword: 'short' }) || '',
    /8 characters/i,
  );
  assert.match(
    validatePasswordChangeInput({ newPassword: 'secure-pass-123', confirmPassword: 'different-pass' }) || '',
    /match/i,
  );
});

test('accepts a password change without requiring the current password', () => {
  assert.equal(
    validatePasswordChangeInput({ newPassword: 'secure-pass-123', confirmPassword: 'secure-pass-123' }),
    null,
  );
});

test('rejects incomplete password changes before hashing', () => {
  assert.match(
    validatePasswordChangeInput({ newPassword: undefined, confirmPassword: 'secure-pass-123' }) || '',
    /required/i,
  );
});
