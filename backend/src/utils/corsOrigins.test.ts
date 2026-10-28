import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_CORS_ORIGINS, isAllowedOrigin, resolveCorsOrigins } from './corsOrigins';
import { authTokenLifetime } from './authTokenLifetime';

test('only the JCB Exchange sites may call the API from a browser in production', () => {
  const env = { NODE_ENV: 'production' } as NodeJS.ProcessEnv;
  const allowed = resolveCorsOrigins(env);
  assert.deepEqual([...allowed], DEFAULT_CORS_ORIGINS);
  assert.ok(isAllowedOrigin('https://jcbexchange.com', allowed, env));
  assert.ok(isAllowedOrigin('https://ADMIN.jcbexchange.com/', allowed, env));
  assert.equal(isAllowedOrigin('https://evil.example', allowed, env), false);
  assert.equal(isAllowedOrigin('https://jcbexchange.com.evil.example', allowed, env), false);
  assert.equal(isAllowedOrigin('http://localhost:3001', allowed, env), false);
  // Mobile app, webhooks and server-to-server calls send no Origin.
  assert.ok(isAllowedOrigin(undefined, allowed, env));
});

test('CORS_ORIGINS replaces the defaults; localhost works outside production', () => {
  const env = { CORS_ORIGINS: 'https://jcb-admin.vercel.app/, https://jcbexchange.com', NODE_ENV: 'development' } as NodeJS.ProcessEnv;
  const allowed = resolveCorsOrigins(env);
  assert.deepEqual([...allowed], ['https://jcb-admin.vercel.app', 'https://jcbexchange.com']);
  assert.equal(isAllowedOrigin('https://admin.jcbexchange.com', allowed, env), false);
  assert.ok(isAllowedOrigin('http://localhost:3001', allowed, env));
  assert.equal(isAllowedOrigin('http://localhost.evil.example', allowed, env), false);
});

test('staff tokens last 12 hours, customer and partner tokens 7 days', () => {
  for (const role of ['SUPER_ADMIN', 'ADMIN', 'EMPLOYEE', 'employee']) assert.equal(authTokenLifetime(role), '12h');
  for (const role of ['CUSTOMER', 'PARTNER', undefined]) assert.equal(authTokenLifetime(role), '7d');
});
