import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeRegistrationContacts } from './registrationContact';

test('uses the mobile number as WhatsApp when the user confirms they are the same', () => {
  assert.deepEqual(
    normalizeRegistrationContacts({
      mobile: '+91 89660 00253',
      whatsappSameAsMobile: true,
      whatsappNumber: '9999999999',
    }),
    {
      ok: true,
      mobile: '8966000253',
      whatsappNumber: '8966000253',
    },
  );
});

test('requires and normalizes a separate WhatsApp number when it differs', () => {
  assert.deepEqual(
    normalizeRegistrationContacts({
      mobile: '8966000253',
      whatsappSameAsMobile: false,
      whatsappNumber: '+91 81099 12840',
    }),
    {
      ok: true,
      mobile: '8966000253',
      whatsappNumber: '8109912840',
    },
  );
});

test('rejects a missing or invalid separate WhatsApp number', () => {
  assert.deepEqual(
    normalizeRegistrationContacts({
      mobile: '8966000253',
      whatsappSameAsMobile: false,
    }),
    { ok: false, error: 'Enter a valid 10-digit WhatsApp number.' },
  );

  assert.deepEqual(
    normalizeRegistrationContacts({
      mobile: '8966000253',
      whatsappSameAsMobile: false,
      whatsappNumber: '12345',
    }),
    { ok: false, error: 'Enter a valid 10-digit WhatsApp number.' },
  );
});

test('keeps older clients working when the preference is omitted', () => {
  assert.deepEqual(
    normalizeRegistrationContacts({ mobile: '8966000253' }),
    {
      ok: true,
      mobile: '8966000253',
      whatsappNumber: '8966000253',
    },
  );
});
