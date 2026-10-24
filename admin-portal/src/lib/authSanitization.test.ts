import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sanitizeEmail,
  isValidEmail,
  sanitizeMobile,
  isValidIndianMobile,
  sanitizeName,
  sanitizePassword,
} from './authSanitization';

test('sanitizeEmail strips whitespace, transforms to lowercase, and removes malicious characters', () => {
  assert.equal(sanitizeEmail('  Admin@JCBExchange.Com  '), 'admin@jcbexchange.com');
  assert.equal(sanitizeEmail('<script>alert("xss")</script>user@domain.com'), 'scriptalert(xss)/scriptuser@domain.com');
  assert.equal(sanitizeEmail('user\0name@domain.com'), 'username@domain.com');
  assert.equal(sanitizeEmail(null), '');
  assert.equal(sanitizeEmail(undefined), '');
});

test('isValidEmail validates legitimate emails and rejects invalid ones', () => {
  assert.equal(isValidEmail('admin@jcbexchange.com'), true);
  assert.equal(isValidEmail('partner.super+test@domain.co.in'), true);
  assert.equal(isValidEmail('invalid-email'), false);
  assert.equal(isValidEmail('@missinguser.com'), false);
  assert.equal(isValidEmail('user@'), false);
  assert.equal(isValidEmail(''), false);
});

test('sanitizeMobile extracts pure 10 digits and handles country prefixes', () => {
  assert.equal(sanitizeMobile('+91 98765 43210'), '9876543210');
  assert.equal(sanitizeMobile('919876543210'), '9876543210');
  assert.equal(sanitizeMobile('09876543210'), '9876543210');
  assert.equal(sanitizeMobile('(987) 654-3210'), '9876543210');
});

test('isValidIndianMobile validates 10-digit numbers starting with 6,7,8,9', () => {
  assert.equal(isValidIndianMobile('9876543210'), true);
  assert.equal(isValidIndianMobile('7123456789'), true);
  assert.equal(isValidIndianMobile('5123456789'), false); // starts with 5
  assert.equal(isValidIndianMobile('98765'), false); // too short
  assert.equal(isValidIndianMobile('987654321012'), false); // too long
});

test('sanitizeName cleans HTML tags, collapses spaces, and prevents script injection', () => {
  assert.equal(sanitizeName('  John   Doe  '), 'John Doe');
  assert.equal(sanitizeName('<b>Dealer</b> Name'), 'Dealer Name');
  assert.equal(sanitizeName('<script>alert(1)</script>Bob'), 'alert(1)Bob');
});

test('sanitizePassword preserves valid symbols while stripping null bytes and control chars', () => {
  assert.equal(sanitizePassword('P@ssw0rd!#$'), 'P@ssw0rd!#$');
  assert.equal(sanitizePassword('Pass\0word'), 'Password');
});
