import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const controllerSource = readFileSync(new URL('./auth.controller.ts', import.meta.url), 'utf8');
const loginPageSource = readFileSync(
  new URL('../../../admin-portal/src/app/(auth)/login/page.tsx', import.meta.url),
  'utf8'
);

test('portal login normalizes email before the database lookup', () => {
  assert.match(controllerSource, /const normalizedEmail = typeof email === 'string' \? email\.trim\(\)\.toLowerCase\(\) : ''/);
  assert.match(controllerSource, /where: \{ email: normalizedEmail \}/);
});

test('portal login uses browser-safe credential autocomplete fields', () => {
  assert.match(loginPageSource, /name="email"/);
  assert.match(loginPageSource, /autoComplete="username"/);
  assert.match(loginPageSource, /name="password"/);
  assert.match(loginPageSource, /autoComplete="current-password"/);
});
