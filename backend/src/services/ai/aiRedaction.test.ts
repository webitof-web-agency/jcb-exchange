import assert from 'node:assert/strict';
import test from 'node:test';
import { redactSensitiveData } from './aiRedaction';

test('redacts common Indian identity and contact values before AI use', () => {
  const input = 'Call 9876543210 or email ops@example.com. PAN ABCDE1234F, Aadhaar 1234 5678 9012, UPI demo@upi.';
  const redacted = redactSensitiveData(input);

  assert.equal(redacted.includes('9876543210'), false);
  assert.equal(redacted.includes('ops@example.com'), false);
  assert.equal(redacted.includes('ABCDE1234F'), false);
  assert.equal(redacted.includes('1234 5678 9012'), false);
  assert.equal(redacted.includes('demo@upi'), false);
  assert.match(redacted, /\[REDACTED_MOBILE\]/);
  assert.match(redacted, /\[REDACTED_EMAIL\]/);
  assert.match(redacted, /\[REDACTED_PAN\]/);
  assert.match(redacted, /\[REDACTED_AADHAAR\]/);
  assert.match(redacted, /\[REDACTED_UPI\]/);
});

test('redacts sensitive values in key-value payload text', () => {
  const redacted = redactSensitiveData('mobile=9876543210 password=secret token=abc123 bankAccount=123456789 transactionReference=UTR123456789');

  assert.equal(redacted.includes('secret'), false);
  assert.equal(redacted.includes('abc123'), false);
  assert.equal(redacted.includes('123456789'), false);
  assert.equal(redacted.includes('UTR123456789'), false);
});

test('redacts quoted financial fields from JSON tool context', () => {
  const redacted = redactSensitiveData(JSON.stringify({
    bankAccount: '1234567890123456',
    ifscCode: 'HDFC0001234',
    transactionReference: 'UTR-987654321',
    paymentId: 'pay_123456789',
  }));

  assert.equal(redacted.includes('1234567890123456'), false);
  assert.equal(redacted.includes('HDFC0001234'), false);
  assert.equal(redacted.includes('UTR-987654321'), false);
  assert.equal(redacted.includes('pay_123456789'), false);
});
