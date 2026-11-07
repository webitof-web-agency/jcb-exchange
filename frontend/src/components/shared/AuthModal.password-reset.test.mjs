import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./AuthModal.tsx', import.meta.url), 'utf8');

test('clears login credentials and password visibility when the auth flow resets', () => {
  const resetFunction = source.match(/const resetOtpState = useCallback\(\(\) => \{([\s\S]*?)\n  \}, \[\]\);/)?.[1];
  assert.ok(resetFunction, 'auth reset function should exist');
  assert.match(resetFunction, /setEmail\(''\);/);
  assert.match(resetFunction, /setPassword\(''\);/);
  assert.match(resetFunction, /setShowPassword\(false\);/);
});

test('prevents browsers from restoring saved login credentials in the modal', () => {
  assert.match(source, /<form[\s\S]*?autoComplete="off"/);
  assert.match(source, /name=\{isLogin \? 'jcb-login-email' : 'email'\}[\s\S]*?autoComplete=\{isLogin \? 'new-password' : 'email'\}/);
  assert.match(source, /name=\{isLogin \? 'jcb-login-password' : 'password'\}[\s\S]*?autoComplete="new-password"/);
});
