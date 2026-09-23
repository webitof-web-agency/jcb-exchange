import assert from 'node:assert/strict';
import test from 'node:test';
import { getAdminSecretValue, isAdminSecretKey } from './adminSecretReveal';

const secrets = {
  mobileOtpApiKey: 'sms-key',
  emailOtpAppPassword: 'gmail-app-password',
  razorpayKeySecret: 'razorpay-secret',
  razorpayWebhookSecret: 'razorpay-webhook',
  phonepeClientSecret: 'phonepe-secret',
  googleDriveClientSecret: 'drive-client-secret',
  googleDriveRefreshToken: 'drive-refresh-token',
};

test('allows only the explicit admin secret keys', () => {
  assert.equal(isAdminSecretKey('mobileOtpApiKey'), true);
  assert.equal(isAdminSecretKey('jwtSecret'), false);
});

test('returns only the requested secret', () => {
  assert.equal(getAdminSecretValue('mobileOtpApiKey', secrets), 'sms-key');
  assert.equal(getAdminSecretValue('googleDriveRefreshToken', secrets), 'drive-refresh-token');
});
