import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canResendEmailOtpChallenge,
  canVerifyEmailOtpChallenge,
  generateEmailOtp,
  hashEmailOtp,
  maskEmailOtpAddress,
  matchesEmailOtp,
  normalizeEmailOtpAddress,
} from './emailOtp.js';

test('normalizes valid email addresses and rejects malformed values', () => {
  assert.equal(normalizeEmailOtpAddress('  User@Example.com '), 'user@example.com');
  assert.equal(normalizeEmailOtpAddress('not-an-email'), null);
});

test('masks the email while preserving enough context for the user', () => {
  assert.equal(maskEmailOtpAddress('rahul@example.com'), 'ra***@example.com');
});

test('generates an OTP with the requested length and verifies only the matching value', () => {
  const otp = generateEmailOtp(6);
  const hash = hashEmailOtp('user@example.com', otp, 'test-secret');

  assert.match(otp, /^\d{6}$/);
  assert.equal(matchesEmailOtp('user@example.com', otp, hash, 'test-secret'), true);
  assert.equal(matchesEmailOtp('user@example.com', '000000', hash, 'test-secret'), false);
  assert.equal(matchesEmailOtp('other@example.com', otp, hash, 'test-secret'), false);
});

test('blocks expired and exhausted email OTP challenges', () => {
  assert.equal(
    canVerifyEmailOtpChallenge({ status: 'PENDING', attemptCount: 0, expiresAt: new Date(Date.now() + 1_000) }),
    true,
  );
  assert.equal(
    canVerifyEmailOtpChallenge({ status: 'PENDING', attemptCount: 5, expiresAt: new Date(Date.now() + 1_000) }),
    false,
  );
  assert.equal(
    canResendEmailOtpChallenge({ status: 'PENDING', resendCount: 0, createdAt: new Date(Date.now() - 60_000) }),
    true,
  );
  assert.equal(
    canResendEmailOtpChallenge({ status: 'PENDING', resendCount: 5, createdAt: new Date(Date.now() - 60_000) }),
    false,
  );
});
