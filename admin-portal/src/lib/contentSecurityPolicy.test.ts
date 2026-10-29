import assert from 'node:assert/strict';
import test from 'node:test';
import { apiOriginFrom, buildContentSecurityPolicy } from './contentSecurityPolicy';

const directive = (policy: string, name: string) => policy.split('; ').find((part) => part.startsWith(`${name} `)) || '';

test('production policy: scripts need the nonce, no eval, no framing, no plugins', () => {
  const policy = buildContentSecurityPolicy({ nonce: 'abc123', apiOrigin: 'https://api.jcbexchange.com' });
  assert.equal(directive(policy, 'script-src'), "script-src 'self' 'nonce-abc123' 'strict-dynamic'");
  assert.ok(!policy.includes("'unsafe-eval'"));
  assert.ok(!directive(policy, 'script-src').includes("'unsafe-inline'"));
  assert.equal(directive(policy, 'frame-ancestors'), "frame-ancestors 'none'");
  assert.equal(directive(policy, 'object-src'), "object-src 'none'");
  assert.equal(directive(policy, 'base-uri'), "base-uri 'self'");
  assert.ok(directive(policy, 'connect-src').includes('https://api.jcbexchange.com'));
  assert.ok(policy.includes('upgrade-insecure-requests'));
});

test('development policy allows eval and the local API over http', () => {
  const policy = buildContentSecurityPolicy({ nonce: 'n', apiOrigin: apiOriginFrom('http://localhost:5002/api'), isDev: true });
  assert.ok(directive(policy, 'script-src').includes("'unsafe-eval'"));
  assert.ok(directive(policy, 'connect-src').includes('http://localhost:5002'));
  assert.ok(!policy.includes('upgrade-insecure-requests'));
});

test('a bad API URL is ignored', () => {
  assert.equal(apiOriginFrom('not a url'), '');
  assert.equal(apiOriginFrom(undefined), '');
});
