import assert from 'node:assert/strict';
import test from 'node:test';
import { completePasswordReset, PasswordResetServiceError } from './passwordReset.service';

test('rejects an expired password reset token before changing a password', async () => {
  await assert.rejects(
    completePasswordReset({
      rawToken: 'expired-token',
      passwordHash: 'hashed-password',
      repository: {
        findByTokenHash: async () => ({
          id: 'reset-1',
          userId: 'user-1',
          consumedAt: null,
          expiresAt: new Date(Date.now() - 1_000),
        }),
        consumeAndUpdatePassword: async () => ({ userId: 'user-1' }),
      },
    }),
    (error: unknown) => error instanceof PasswordResetServiceError && error.code === 'TOKEN_INVALID',
  );
});

test('atomically consumes a valid reset token and updates the linked account', async () => {
  let consumedTokenHash = '';
  let updatedPasswordHash = '';

  const result = await completePasswordReset({
    rawToken: 'valid-token',
    passwordHash: 'hashed-password',
    repository: {
      findByTokenHash: async () => ({
        id: 'reset-1',
        userId: 'user-1',
        consumedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      }),
      consumeAndUpdatePassword: async ({ tokenId, tokenHash, passwordHash: nextPasswordHash }) => {
        assert.equal(tokenId, 'reset-1');
        consumedTokenHash = tokenHash;
        updatedPasswordHash = nextPasswordHash;
        return { userId: 'user-1' };
      },
    },
  });

  assert.equal(result.userId, 'user-1');
  assert.equal(consumedTokenHash.length, 64);
  assert.equal(updatedPasswordHash, 'hashed-password');
});
