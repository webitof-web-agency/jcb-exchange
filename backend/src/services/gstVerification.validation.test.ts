import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeGstin, validateGstin } from './gstVerification.validation';

test('normalizes lowercase GSTIN and whitespace', () => {
  assert.equal(normalizeGstin(' 08akwpj1234h1zn '), '08AKWPJ1234H1ZN');
});

test('accepts a standard 15-character GSTIN format', () => {
  assert.equal(validateGstin('08AKWPJ1234H1ZN'), null);
});

test('rejects empty, wrong-length, and malformed GSTIN values', () => {
  assert.equal(validateGstin(''), 'GSTIN is required.');
  assert.match(validateGstin('08AKWPJ1234H1Z') || '', /15-character/);
  assert.match(validateGstin('08AKWPJ1234H1Z!') || '', /valid GSTIN/);
});
