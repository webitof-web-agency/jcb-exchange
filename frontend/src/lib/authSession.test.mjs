import assert from 'node:assert/strict';
import test from 'node:test';
import {
  hasAuthorizationHeader,
  isAuthenticationFailure,
  isUsableAuthToken,
} from './authSession.mjs';

const encodePayload = (payload) => {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `header.${encoded}.signature`;
};

test('rejects expired or malformed tokens before a protected request', () => {
  assert.equal(isUsableAuthToken(encodePayload({ exp: 100 }), 100_000), false);
  assert.equal(isUsableAuthToken('not-a-jwt', 100_000), false);
});

test('accepts a token whose expiry is still in the future', () => {
  assert.equal(isUsableAuthToken(encodePayload({ exp: 200 }), 100_000), true);
});

test('recognizes session failures and AxiosHeaders authorization values', () => {
  assert.equal(isAuthenticationFailure({ response: { status: 401 } }), true);
  assert.equal(isAuthenticationFailure({ response: { status: 403, data: { code: 'ACCOUNT_INACTIVE' } } }), true);
  assert.equal(isAuthenticationFailure({ response: { status: 403, data: { code: 'FORBIDDEN' } } }), false);

  const headers = new Map([['authorization', 'Bearer token']]);
  headers.get = headers.get.bind(headers);
  assert.equal(hasAuthorizationHeader(headers), true);
  assert.equal(hasAuthorizationHeader({ Authorization: 'Bearer token' }), true);
  assert.equal(hasAuthorizationHeader({}), false);
});
