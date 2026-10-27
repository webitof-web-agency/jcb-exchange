import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const formPath = new URL('./SoldVehicleForm.tsx', import.meta.url);

test('Sold Vehicle form has no retired stamp paper/eSign workflow mount', async () => {
  const source = await readFile(formPath, 'utf8');

  for (const text of [
    'SellAccountDeedWorkflowCard',
    '/deeds/',
    'Stamp paper + Aadhaar eSign',
    'Start eSign',
  ]) {
    assert.equal(source.includes(text), false, `retired eSign UI reference remains: ${text}`);
  }
});
