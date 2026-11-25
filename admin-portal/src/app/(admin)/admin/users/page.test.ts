import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('new employee password field uses the shared HRM generator and visibility controls', async () => {
  const source = await readFile(new URL('./page.tsx', import.meta.url), 'utf8');

  assert.match(source, /generateTemporaryPassword/);
  assert.match(source, /showCreatePassword/);
  assert.match(source, /Hide password/);
  assert.match(source, /Show password/);
  assert.match(source, />\s*Generate\s*</);
});
