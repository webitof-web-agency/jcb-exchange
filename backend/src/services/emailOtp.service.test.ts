import assert from 'node:assert/strict';
import test from 'node:test';
import { buildEmailOtpMessage, sendEmailOtp } from './emailOtp.service';

test('builds a safe email OTP message with plain text and HTML alternatives', () => {
  const message = buildEmailOtpMessage({ otp: '123456', senderName: 'JCB <Exchange>', expiryMinutes: 10 });

  assert.equal(message.subject, 'JCB <Exchange> login verification code');
  assert.match(message.text, /123456/);
  assert.match(message.html, /JCB &lt;Exchange&gt;/);
  assert.doesNotMatch(message.html, /<Exchange>/);
});

test('sends an email OTP through the injected transport', async () => {
  let sentMessage: Record<string, unknown> | undefined;
  const transport = {
    sendMail: async (message: any) => {
      sentMessage = message as Record<string, unknown>;
      return { envelope: { from: 'no-reply@example.com', to: ['user@example.com'] }, messageId: 'test-message' };
    },
  };

  await sendEmailOtp({
    to: 'user@example.com',
    otp: '123456',
    settings: {
      enabled: true,
      smtpHost: 'smtp.gmail.com',
      smtpPort: 465,
      smtpSecure: true,
      senderEmail: 'no-reply@example.com',
      senderName: 'JCB Exchange',
      appPassword: 'secret',
      otpExpiryMinutes: 10,
      otpLength: 6,
      updatedAt: null,
      updatedByUserId: null,
    },
    transport,
  });

  assert.equal(sentMessage?.to, 'user@example.com');
  assert.match(String(sentMessage?.subject), /verification code/);
});
