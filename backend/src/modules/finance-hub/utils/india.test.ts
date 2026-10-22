import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isValidGstin,
  isValidIfsc,
  isValidPan,
  isValidPinCode,
  isValidTan,
  normalizeGstin,
  normalizeIndianMobile,
  panFromGstin,
  stateCodeForName,
} from './india';

test('isValidGstin checks format, state code and checksum', () => {
  assert.equal(isValidGstin('27AAPFU0939F1ZV'), true);
  assert.equal(isValidGstin('29AAGCB7383J1Z4'), true);
  assert.equal(isValidGstin('27AAPFU0939F1ZW'), false, 'wrong check character');
  assert.equal(isValidGstin('99AAPFU0939F1ZV'), false, 'unknown state');
  assert.equal(isValidGstin('27AAPFU0939F1Z'), false, 'too short');
  assert.equal(normalizeGstin(' 27aapfu0939f1zv '), '27AAPFU0939F1ZV');
  assert.equal(panFromGstin('27AAPFU0939F1ZV'), 'AAPFU0939F');
});

test('PAN, TAN, IFSC and PIN code formats', () => {
  assert.equal(isValidPan('AAPFU0939F'), true);
  assert.equal(isValidPan('AAPF0939F'), false);
  assert.equal(isValidTan('MUMA12345B'), true);
  assert.equal(isValidTan('MUM123456B'), false);
  assert.equal(isValidIfsc('HDFC0001234'), true);
  assert.equal(isValidIfsc('HDFC1001234'), false, 'fifth character must be zero');
  assert.equal(isValidPinCode('400001'), true);
  assert.equal(isValidPinCode('012345'), false);
});

test('normalizeIndianMobile strips country and trunk prefixes', () => {
  assert.equal(normalizeIndianMobile('+91 98765-43210'), '9876543210');
  assert.equal(normalizeIndianMobile('09876543210'), '9876543210');
  assert.equal(normalizeIndianMobile('919876543210'), '9876543210');
  assert.equal(normalizeIndianMobile('12345'), null);
  assert.equal(normalizeIndianMobile('5876543210'), null);
  assert.equal(normalizeIndianMobile(null), null);
});

test('stateCodeForName matches GST state names and common aliases', () => {
  assert.equal(stateCodeForName('Maharashtra'), '27');
  assert.equal(stateCodeForName('  tamil   nadu '), '33');
  assert.equal(stateCodeForName('New Delhi'), '07');
  assert.equal(stateCodeForName('Orissa'), '21');
  assert.equal(stateCodeForName('Atlantis'), null);
});
