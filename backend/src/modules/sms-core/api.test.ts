import assert from 'node:assert/strict';
import test from 'node:test';
import { sendDltSms } from './api';

test('sends the documented Flowitof DLT JSON payload', async () => {
  let request: RequestInit | undefined;
  let url = '';

  const result = await sendDltSms({
    baseUrl: 'https://sms.flowitof.com/dev',
    apiKey: 'test-api-key',
    senderId: 'SMSHDR',
    messageId: '111111',
    numbers: '9876543210',
    variablesValues: 'Rahul|6695',
    smsDetails: '0',
  }, {
    fetchImplementation: async (requestUrl, init) => {
      url = String(requestUrl);
      request = init;
      return new Response(JSON.stringify({ message: 'SMS sent successfully', request_id: 'req-1' }), { status: 200 });
    },
  });

  assert.equal(result.providerMessageId, 'req-1');
  assert.equal(url, 'https://sms.flowitof.com/dev/bulkV2');
  assert.equal((request?.headers as Record<string, string>).Authorization, 'test-api-key');
  assert.deepEqual(JSON.parse(String(request?.body)), {
    sender_id: 'SMSHDR',
    message: '111111',
    variables_values: 'Rahul|6695',
    route: 'dlt',
    numbers: '9876543210',
    sms_details: '0',
  });
});

test('rejects provider errors without leaking the API key', async () => {
  await assert.rejects(
    sendDltSms({
      baseUrl: 'https://sms.flowitof.com/dev',
      apiKey: 'secret-api-key',
      senderId: 'SMSHDR',
      messageId: '111111',
      numbers: '9876543210',
      variablesValues: '',
      smsDetails: '0',
    }, {
      fetchImplementation: async () => new Response(JSON.stringify({ error: 'invalid message' }), { status: 400 }),
    }),
    /Flowitof SMS request was rejected: invalid message/,
  );
});
