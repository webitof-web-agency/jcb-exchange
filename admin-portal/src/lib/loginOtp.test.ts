import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getOtpResendSecondsRemaining,
  getOtpSecondsRemaining,
  normalizeOtpCooldownSeconds,
  normalizeOtpExpirySeconds,
  normalizeOtpInput,
  normalizeOtpLength,
} from './loginOtp';

test('normalizes OTP configuration to safe client bounds', () => {
  assert.equal(normalizeOtpLength(undefined), 6);
  assert.equal(normalizeOtpLength(3), 4);
  assert.equal(normalizeOtpLength(12), 10);
  assert.equal(normalizeOtpExpirySeconds(undefined, 900), 900);
  assert.equal(normalizeOtpExpirySeconds(30, 900), 60);
  assert.equal(normalizeOtpCooldownSeconds(0), 1);
  assert.equal(normalizeOtpCooldownSeconds(120), 120);
});

test('keeps OTP input numeric and bounded', () => {
  assert.equal(normalizeOtpInput('a1 2-3x4', 4), '1234');
  assert.equal(normalizeOtpInput('987654', 6), '987654');
});

test('calculates expiry and resend countdowns without negative values', () => {
  const now = 1_000_000;
  assert.equal(getOtpSecondsRemaining(now + 10_500, now), 11);
  assert.equal(getOtpSecondsRemaining(now - 1, now), 0);
  assert.equal(getOtpResendSecondsRemaining(now + 2_100, now), 3);
  assert.equal(getOtpResendSecondsRemaining(0, now), 0);
});
