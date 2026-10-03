import assert from 'node:assert/strict';
import test from 'node:test';
import { getProfileMobileCandidates, normalizeProfileMobile } from './profileMobile';

test('normalizes profile mobile numbers to the same canonical value used by OTP login', () => {
  assert.equal(normalizeProfileMobile('+91 89660 00253'), '8966000253');
  assert.equal(normalizeProfileMobile('08966000253'), '8966000253');
  assert.deepEqual(getProfileMobileCandidates('+91 89660 00253'), [
    '8966000253',
    '918966000253',
    '+918966000253',
    '08966000253',
  ]);
});

test('returns null for an empty or invalid profile mobile number', () => {
  assert.equal(normalizeProfileMobile(''), null);
  assert.equal(normalizeProfileMobile('12345'), null);
  assert.deepEqual(getProfileMobileCandidates('12345'), []);
});
