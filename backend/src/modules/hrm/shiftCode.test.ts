import assert from 'node:assert/strict';
import test from 'node:test';
import { nextShiftCode } from './shiftRules';
import { parseHrmInput, schemas } from './validation';

test('shift codes are generated in sequence and are not typed by anybody', () => {
  assert.equal(nextShiftCode([]), 'SH-001');
  assert.equal(nextShiftCode(['GEN', 'SH-002', 'sh-010', 'NIGHT']), 'SH-011');
  assert.equal(nextShiftCode(['SH-999']), 'SH-1000');
  const shift = { name: 'General', startTime: '09:30', endTime: '18:30' };
  assert.equal('code' in parseHrmInput(schemas.createShift, shift), false);
  assert.throws(() => parseHrmInput(schemas.createShift, { ...shift, code: 'GEN' }));
});
