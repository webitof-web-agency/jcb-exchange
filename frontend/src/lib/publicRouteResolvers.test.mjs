import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const resolverPath = new URL('./publicRouteResolvers.ts', import.meta.url);

test('public machine slug resolver preserves sold vehicle detail links', async () => {
  const source = await readFile(resolverPath, 'utf8');

  assert.equal(source.includes('/master/public-listings?status=SOLD'), true);
});
