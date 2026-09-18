import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeApiBaseUrl } from './apiBaseUrl.mjs';

test('adds the API prefix when a deployment environment provides only the origin', () => {
  assert.equal(
    normalizeApiBaseUrl('https://jcb-exchange.onrender.com'),
    'https://jcb-exchange.onrender.com/api',
  );
});

test('keeps a correctly configured API URL without duplicating its prefix', () => {
  assert.equal(
    normalizeApiBaseUrl('https://jcb-exchange.onrender.com/api/'),
    'https://jcb-exchange.onrender.com/api',
  );
});
