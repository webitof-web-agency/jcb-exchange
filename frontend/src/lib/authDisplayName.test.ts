import assert from 'node:assert/strict';
import test from 'node:test';
import { getAuthDisplayName } from './authDisplayName';

test('prefers the saved name for authenticated users', () => {
  assert.equal(getAuthDisplayName({ name: 'Aarav', email: 'aarav@example.com', mobile: '9876543210' }), 'Aarav');
});

test('falls back to email and then mobile for mobile-only accounts', () => {
  assert.equal(getAuthDisplayName({ name: null, email: 'aarav@example.com', mobile: '9876543210' }), 'aarav@example.com');
  assert.equal(getAuthDisplayName({ name: '', email: null, mobile: '9876543210' }), '9876543210');
});

test('uses a safe account label when no identity field is available', () => {
  assert.equal(getAuthDisplayName({ name: null, email: null, mobile: null }), 'My Account');
});
