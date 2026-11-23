import assert from 'node:assert/strict';
import test from 'node:test';
import { buildVerificationCacheKey } from './verificationRequestCache';

test('scopes verification cache keys to the authenticated user when provided', () => {
  assert.notEqual(
    buildVerificationCacheKey('rc-full', 'CG12BM3734', 'super-admin-user'),
    buildVerificationCacheKey('rc-full', 'CG12BM3734', 'partner-user'),
  );
});

