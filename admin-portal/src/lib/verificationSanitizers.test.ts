import assert from 'node:assert/strict';
import test from 'node:test';
import {
  sanitizePan,
  sanitizeGstin,
  sanitizePersonName,
  sanitizeMobileNumber,
  sanitizeDrivingLicenseNumber,
  sanitizeRcNumber,
  sanitizeChassisNumber,
  sanitizeEngineNumber,
  sanitizeSearchInput,
} from './verificationSanitizers';

test('sanitizePan converts to uppercase, removes spaces and invalid characters, limits to 10', () => {
  assert.equal(sanitizePan(' abc de123 4f! '), 'ABCDE1234F');
  assert.equal(sanitizePan('abcde1234f99999'), 'ABCDE1234F');
  assert.equal(sanitizePan('<script>'), 'SCRIPT');
  assert.equal(sanitizePan(''), '');
});

test('sanitizeGstin converts to uppercase, removes spaces and invalid symbols, limits to 15', () => {
  assert.equal(sanitizeGstin(' 08ak wpj12 34h1zn! '), '08AKWPJ1234H1ZN');
  assert.equal(sanitizeGstin('08akwpj1234h1zn9999'), '08AKWPJ1234H1ZN');
  assert.equal(sanitizeGstin(''), '');
});

test('sanitizePersonName removes numbers and dangerous characters, collapses spaces', () => {
  assert.equal(sanitizePersonName('  John   Doe123  ', 150, true), 'John Doe');
  assert.equal(sanitizePersonName('  John ', 150, false), 'John ');
  assert.equal(sanitizePersonName("O'Connor-Smith, Jr.", 150, true), "O'Connor-Smith Jr.");
  assert.equal(sanitizePersonName('<script>alert("xss")</script>', 150, true), 'scriptalertxssscript');
});

test('sanitizeMobileNumber extracts digits only and limits length', () => {
  assert.equal(sanitizeMobileNumber('+91 98765-43210'), '919876543210');
  assert.equal(sanitizeMobileNumber('8888 808 969'), '8888808969');
  assert.equal(sanitizeMobileNumber('abc'), '');
});

test('sanitizeDrivingLicenseNumber retains uppercase alphanumeric, slashes and hyphens', () => {
  assert.equal(sanitizeDrivingLicenseNumber(' dl-04 / 2011 0012345! '), 'DL-04/20110012345');
  assert.equal(sanitizeDrivingLicenseNumber('UP2020150000000'), 'UP2020150000000');
});

test('sanitizeRcNumber retains uppercase alphanumeric, slashes and hyphens without spaces', () => {
  assert.equal(sanitizeRcNumber(' rj 14-xj / 1234! '), 'RJ14-XJ/1234');
  assert.equal(sanitizeRcNumber('DL01AB1234'), 'DL01AB1234');
});

test('sanitizeChassisNumber removes spaces and invalid symbols', () => {
  assert.equal(sanitizeChassisNumber(' malbm 51abc 123456! '), 'MALBM51ABC123456');
});

test('sanitizeEngineNumber allows alphanumeric, dots, slashes and hyphens', () => {
  assert.equal(sanitizeEngineNumber(' k10c. nc-26/5773! '), 'K10C.NC-26/5773');
});

test('sanitizeSearchInput removes control characters and collapses whitespace', () => {
  assert.equal(sanitizeSearchInput('   hello   world\u0000 ', 50, true), 'hello world');
});
