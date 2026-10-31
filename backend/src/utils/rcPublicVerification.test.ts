import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createRcPublicVerificationToken,
  verifyRcPublicVerificationToken,
} from './rcPublicVerification';

test('RC public verification tokens round-trip the record id', () => {
  const token = createRcPublicVerificationToken('record-123', 'test-secret');
  assert.equal(verifyRcPublicVerificationToken(token, 'test-secret'), 'record-123');
});

test('RC public verification tokens reject tampering and wrong secrets', () => {
  const token = createRcPublicVerificationToken('record-123', 'test-secret');
  const tampered = `${token.slice(0, -1)}${token.endsWith('a') ? 'b' : 'a'}`;
  assert.equal(verifyRcPublicVerificationToken(tampered, 'test-secret'), null);
  assert.equal(verifyRcPublicVerificationToken(token, 'wrong-secret'), null);
});
