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

test('uses the browser-safe autocomplete hints for login credentials', () => {
  assert.match(source, /autoComplete=\{isLogin \? 'username' : 'email'\}/);
  assert.match(source, /autoComplete=\{isLogin \? 'current-password' : 'new-password'\}/);
});
