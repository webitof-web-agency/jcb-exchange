import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sellVehicleModal = readFileSync(
  new URL('../components/sell/SellVehicleModal.tsx', import.meta.url),
  'utf8',
);

test('includes the verified registration number in listing submit payloads', () => {
  assert.match(
    sellVehicleModal,
    /modelName:\s*sanitizedForm\.model,[\s\S]*registrationNo:\s*sanitizedForm\.registrationNo,/,
  );
});
