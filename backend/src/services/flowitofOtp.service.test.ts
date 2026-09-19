import assert from 'node:assert/strict';
import test from 'node:test';
import { sendFlowitofOtp, verifyFlowitofOtp, resendFlowitofOtp } from './flowitofOtp.service';

const settings = {
  enabled: true,
  apiKey: 'test-api-key',
  otpId: 'otp-template-id',
  otpExpiry: 15,
  otpLength: 6,
  variablesValues: '15',
  updatedAt: null,
  updatedByUserId: null,
};

test('sends Flowitof OTP with the documented JSON payload', async () => {
  let request: RequestInit | undefined;
  let url = '';
  const response = await sendFlowitofOtp('9876543210', settings, {
    fetchImplementation: async (requestUrl, init) => {
      url = String(requestUrl);
      request = init;
      return new Response(JSON.stringify({ message: 'OTP sent successfully' }), { status: 200 });
    },
  });

  assert.equal(response.success, true);
  assert.equal(url, 'https://sms.flowitof.com/dev/otp/send');
  assert.equal((request?.headers as Record<string, string>).Authorization, 'test-api-key');
  assert.deepEqual(JSON.parse(String(request?.body)), {
    mobile: '9876543210',
    otp_id: 'otp-template-id',
    otp_expiry: 15,
    otp_length: 6,
    variables_values: '{otp}|15',
  });
});

test('uses Flowitof verify and resend endpoints with safe provider errors', async () => {
  const urls: string[] = [];
  const fetchImplementation: typeof fetch = async (requestUrl) => {
    urls.push(String(requestUrl));
    return new Response(JSON.stringify({ message: 'bad request' }), { status: 400 });
  };

  await assert.rejects(
    verifyFlowitofOtp('9876543210', '123456', settings, { fetchImplementation }),
    /Flowitof OTP request was rejected/,
  );
  await assert.rejects(
    resendFlowitofOtp('9876543210', settings, { fetchImplementation }),
    /Flowitof OTP request was rejected/,
  );

  assert.deepEqual(urls, [
    'https://sms.flowitof.com/dev/otp/verify',
    'https://sms.flowitof.com/dev/otp/resend',
  ]);
});
