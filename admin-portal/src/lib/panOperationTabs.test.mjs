import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, '../components/identityHub/IdentityHubPage.tsx'), 'utf8');

test('PAN operations exposes only the Comprehensive tab', () => {
  assert.match(source, /useState<PanTab>\('comprehensive'\)/);
  assert.doesNotMatch(source, /handlePanTabChange\('(verify|aadhaar|contact)'\)/);
  assert.match(source, /handlePanTabChange\('comprehensive'\)/);
});
