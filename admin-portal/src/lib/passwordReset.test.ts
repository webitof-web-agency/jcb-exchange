import assert from 'node:assert/strict';
import test from 'node:test';
import { validatePasswordResetInput } from './passwordReset';

test('accepts a strong matching password for reset', () => {
  assert.equal(validatePasswordResetInput('secure-pass-123', 'secure-pass-123'), null);
});

test('rejects missing, short, oversized, and mismatched reset passwords', () => {
  assert.match(validatePasswordResetInput('', 'secure-pass-123') || '', /required/i);
  assert.match(validatePasswordResetInput('short', 'short') || '', /8 characters/i);
  assert.match(validatePasswordResetInput('a'.repeat(129), 'a'.repeat(129)) || '', /128 characters/i);
  assert.match(validatePasswordResetInput('secure-pass-123', 'different-pass') || '', /match/i);
});
