import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./AuthModal.tsx', import.meta.url), 'utf8');

test('auth modal keeps a centered, viewport-safe card on small screens', () => {
  assert.match(source, /flex items-center justify-center overflow-y-auto bg-black\/60 p-3 sm:p-4/);
  assert.match(source, /my-auto w-full max-w-md max-h-\[calc\(100dvh-1\.5rem\)\] overflow-y-auto rounded-xl/);
});
