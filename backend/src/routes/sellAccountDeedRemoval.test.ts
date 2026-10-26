import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const routesPath = path.join(process.cwd(), 'src', 'routes', 'recruitment.routes.ts');

test('recruitment routes expose no retired sold-vehicle eStamp/eSign endpoints', async () => {
  const source = await readFile(routesPath, 'utf8');

  for (const text of [
    '/public/esign-source',
    '/deeds/',
    'getSellAccountDeedWorkflowRecord',
    'getSellAccountEstampArticles',
    'startSellAccountDeedEsign',
    'refreshSellAccountDeedEsign',
  ]) {
    assert.equal(source.includes(text), false, `retired route reference remains: ${text}`);
  }
});
