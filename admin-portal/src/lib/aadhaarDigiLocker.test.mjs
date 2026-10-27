import assert from 'node:assert/strict';
import test from 'node:test';
import { getAadhaarApiError, getAadhaarDisplayFields } from './aadhaarDigiLocker.mjs';

test('maps a normalized DigiLocker result into safe display fields', () => {
  const fields = getAadhaarDisplayFields({
    fullName: 'Rahul Kumar',
    maskedAadhaar: 'XXXXXXXX1234',
    dob: '1995-05-15',
    gender: 'M',
    mobileNumber: '9876543210',
    fullAddress: 'Connaught Place, New Delhi',
    profileImage: 'data:image/jpeg;base64,abc',
    xmlUrl: 'https://example.com/aadhaar.xml',
  });

  assert.deepEqual(fields, {
    name: 'Rahul Kumar',
    maskedAadhaar: 'XXXXXXXX1234',
    dob: '1995-05-15',
    gender: 'M',
    mobile: '9876543210',
    address: 'Connaught Place, New Delhi',
    profileImage: 'data:image/jpeg;base64,abc',
    xmlUrl: 'https://example.com/aadhaar.xml',
  });
});

test('returns provider error messages without exposing unknown values', () => {
  assert.equal(
    getAadhaarApiError({ response: { data: { error: 'DigiLocker access denied.' } } }, 'Fallback'),
    'DigiLocker access denied.',
  );
  assert.equal(getAadhaarApiError({}, 'Fallback'), 'Fallback');
});
