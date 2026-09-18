import assert from 'node:assert/strict';
import test from 'node:test';
import {
  defaultMobileOtpSettings,
  normalizeLoginMobileNumber,
  normalizeMobileOtpSettings,
} from './mobileOtp';

test('normalizes Flowitof OTP settings to the documented limits', () => {
  const settings = normalizeMobileOtpSettings({
    enabled: true,
    apiKey: ' flowitof-key ',
    otpId: ' template-123 ',
    otpExpiry: 25,
    otpLength: 8,
    variablesValues: 'value1|{otp}',
  });

  assert.deepEqual(settings, {
    ...defaultMobileOtpSettings,
    enabled: true,
    apiKey: 'flowitof-key',
    otpId: 'template-123',
    otpExpiry: 25,
    otpLength: 8,
    variablesValues: 'value1|{otp}',
    updatedAt: null,
    updatedByUserId: null,
  });
});

test('falls back to documented Flowitof defaults and clamps invalid values', () => {
  const settings = normalizeMobileOtpSettings({
    otpExpiry: 0,
    otpLength: 99,
  });

  assert.equal(settings.otpExpiry, 15);
  assert.equal(settings.otpLength, 6);
});

test('accepts legacy mobile formats but returns the Flowitof 10-digit format', () => {
  assert.equal(normalizeLoginMobileNumber('09876543210'), '9876543210');
  assert.equal(normalizeLoginMobileNumber('+91 98765 43210'), '9876543210');
  assert.equal(normalizeLoginMobileNumber('9876543210'), '9876543210');
});
