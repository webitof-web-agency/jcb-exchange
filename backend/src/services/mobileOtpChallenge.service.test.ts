import assert from 'node:assert/strict';
import test from 'node:test';

import { getMobileOtpResendAction } from './mobileOtpChallenge.service';

test('uses a fresh OTP send when the previous challenge is already verified', () => {
  assert.equal(
    getMobileOtpResendAction({
      status: 'VERIFIED',
      resendCount: 0,
      createdAt: new Date(),
    }),
    'SEND',
  );
});

test('uses the provider resend operation for an active challenge', () => {
  assert.equal(
    getMobileOtpResendAction({
      status: 'PENDING',
      resendCount: 0,
      createdAt: new Date(),
    }),
    'RESEND',
  );
});
