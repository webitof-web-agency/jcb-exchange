import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PASSWORD_RESET_TOKEN_TTL_SECONDS,
  createPasswordResetToken,
  hashPasswordResetToken,
  isPasswordResetTokenActive,
} from './passwordReset';

test('creates a high-entropy reset token and stores only its hash', () => {
  const result = createPasswordResetToken(new Date('2026-10-23T10:00:00.000Z'));

  assert.equal(result.rawToken.length, 64);
  assert.equal(result.tokenHash, hashPasswordResetToken(result.rawToken));
  assert.equal(result.expiresAt.toISOString(), '2026-10-23T10:10:00.000Z');
});

test('accepts only an unused reset token before its expiry', () => {
  const now = new Date('2026-10-23T10:00:00.000Z');

  assert.equal(
    isPasswordResetTokenActive({ consumedAt: null, expiresAt: new Date(now.getTime() + 1_000) }, now),
    true,
  );
  assert.equal(
    isPasswordResetTokenActive({ consumedAt: new Date(), expiresAt: new Date(now.getTime() + 1_000) }, now),
    false,
  );
  assert.equal(
    isPasswordResetTokenActive({ consumedAt: null, expiresAt: new Date(now.getTime() - 1_000) }, now),
    false,
  );
  assert.equal(PASSWORD_RESET_TOKEN_TTL_SECONDS, 10 * 60);
});
