import assert from 'node:assert/strict';
import test from 'node:test';
import { getPublicSiteTarget } from './publicSite.mjs';

test('builds a public-site login handoff with the current token', () => {
  const target = new URL(getPublicSiteTarget({
    origin: 'http://localhost:3000',
    token: 'jwt.token/example',
    fallbackPath: '/',
  }));

  assert.equal(target.origin, 'http://localhost:3000');
  assert.equal(target.pathname, '/login');
  assert.equal(target.searchParams.get('token'), 'jwt.token/example');
  assert.equal(target.searchParams.get('next'), '/');
});

test('does not allow an external redirect through the handoff path', () => {
  const target = new URL(getPublicSiteTarget({
    origin: 'https://jcbexchange.com',
    token: 'jwt-token',
    fallbackPath: 'https://malicious.example/steal',
  }));

  assert.equal(target.searchParams.get('next'), '/');
});
