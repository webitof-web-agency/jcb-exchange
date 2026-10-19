import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveJwtSecret } from './jwtSecret';

test('uses the configured JWT secret', () => {
  assert.equal(resolveJwtSecret({ JWT_SECRET: 'configured-secret', NODE_ENV: 'production' }), 'configured-secret');
});

test('refuses the public development secret in production', () => {
  assert.throws(() => resolveJwtSecret({ NODE_ENV: 'production' }), /JWT_SECRET must be set/);
});

test('keeps local development working without a configured secret', () => {
  assert.equal(typeof resolveJwtSecret({ NODE_ENV: 'development' }), 'string');
});
