import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./AuthModal.tsx', import.meta.url), 'utf8');

test('auth modal fills small screens and stays a centered, viewport-safe card on desktop', () => {
  assert.match(source, /fixed inset-0 z-\[10000\] flex flex-col md:items-center md:justify-center overflow-y-auto bg-white md:bg-black\/60 p-0 md:p-4/);
  assert.match(source, /w-full flex-1 md:flex-none md:max-w-md min-h-full md:min-h-0 md:max-h-\[calc\(100dvh-1\.5rem\)\] flex flex-col overflow-y-auto/);
});
