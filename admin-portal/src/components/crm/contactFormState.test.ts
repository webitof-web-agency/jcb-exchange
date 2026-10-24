import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildContactPayload,
  sanitizePhoneInput,
  updateContactLocation,
  validateContactPhones,
  type ContactFormState,
} from './contactFormState';

const form: ContactFormState = {
  mobile: '9876543210',
  name: 'Asha',
  email: 'asha@example.com',
  whatsappNumber: '9876543210',
  alternatePhone: '9123456789',
  companyName: 'Asha Earthmovers',
  city: 'Raipur',
  state: 'Chhattisgarh',
  pinCode: '492001',
  address: 'Main Road',
  gstNumber: '22ABCDE1234F1Z5',
  lifecycle: 'LEAD',
  contactTypes: ['BUYER'],
  tags: ['Urgent buyer'],
  notes: 'Needs a backhoe loader',
  ownerId: 'staff-1',
  preferredLanguage: 'Hindi',
  doNotContact: false,
};

test('buildContactPayload keeps all create-contact profile fields', () => {
  assert.deepEqual(buildContactPayload(form, true), {
    ...form,
    ownerId: 'staff-1',
  });
});

test('buildContactPayload omits owner assignment when the user cannot assign contacts', () => {
  const payload = buildContactPayload(form, false);
  assert.equal('ownerId' in payload, false);
});

test('updateContactLocation clears a stale city when the state changes', () => {
  assert.deepEqual(updateContactLocation(form, 'state', 'Maharashtra'), {
    ...form,
    state: 'Maharashtra',
    city: '',
  });
});

test('sanitizePhoneInput keeps only a valid ten-digit input shape', () => {
  assert.equal(sanitizePhoneInput('98765-43210'), '9876543210');
  assert.equal(sanitizePhoneInput('+91 98765 43210'), '9876543210');
  assert.equal(sanitizePhoneInput('09876543210'), '9876543210');
  assert.equal(sanitizePhoneInput('987654321012345'), '9876543210');
});

test('validateContactPhones rejects an overlong or invalid phone before save', () => {
  assert.equal(validateContactPhones({ ...form, mobile: '98765432101' }), 'Enter a valid 10-digit mobile number.');
  assert.equal(validateContactPhones({ ...form, whatsappNumber: '98765432101' }), 'Enter a valid 10-digit WhatsApp number.');
  assert.equal(validateContactPhones({ ...form, alternatePhone: '1234567890' }), 'Enter a valid 10-digit alternate phone number.');
  assert.equal(validateContactPhones({ ...form, mobile: '9876543210', whatsappNumber: '', alternatePhone: '' }), null);
});

test('buildContactPayload sanitizes every phone field sent to the API', () => {
  const payload = buildContactPayload({
    ...form,
    mobile: '+91 98765 43210',
    whatsappNumber: '09876543210',
    alternatePhone: '98765-43210',
  }, false);
  assert.equal(payload.mobile, '9876543210');
  assert.equal(payload.whatsappNumber, '9876543210');
  assert.equal(payload.alternatePhone, '9876543210');
});
