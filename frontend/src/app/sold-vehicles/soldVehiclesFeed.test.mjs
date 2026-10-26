import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const pagePath = new URL('./SoldVehiclesPageClient.tsx', import.meta.url);

test('sold vehicles page requests only the explicit sold feed', async () => {
  const source = await readFile(pagePath, 'utf8');

  assert.equal(source.includes("api.get('/master/public-listings?status=SOLD')"), true);
  assert.equal(source.includes("api.get('/master/public-listings').catch"), false);
});
