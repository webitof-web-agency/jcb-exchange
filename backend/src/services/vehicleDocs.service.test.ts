import assert from 'node:assert/strict';
import test from 'node:test';
import { buildChecklist, normalizeVehicleNumber, parseDocSection, vehicleZipFileName } from './vehicleDocs.service';

test('checklist marks missing documents NA and follows RTO task status', () => {
  const checklist = buildChecklist(
    [
      { id: 'deed', checklistKey: 'purchaseDeed' },
      { id: 'r1', checklistKey: 'receipts' },
      { id: 'r2', checklistKey: 'receipts' },
      { id: 'rc', checklistKey: 'rto-RC' },
      { id: 'vault', checklistKey: null },
    ],
    [
      { taskKey: 'RC', label: 'RC Transfer', status: 'TRANSFERRED', remark: null },
      { taskKey: 'HSRP', label: 'HSRP Plate', status: 'NOT_REQUIRED', remark: 'Post-2019 vehicle' },
      { taskKey: 'CUSTOM', label: 'Form 29', status: 'PENDING', remark: null },
    ],
  );
  const byKey = new Map(checklist.map((item) => [item.key, item]));
  assert.equal(byKey.get('purchaseDeed')?.state, 'AVAILABLE');
  assert.equal(byKey.get('sellDeed')?.state, 'NA');
  assert.equal(byKey.get('purchaseAadhaarCard')?.section, 'Seller & Purchase');
  assert.deepEqual(byKey.get('receipts')?.docIds, ['r1', 'r2']);
  assert.deepEqual([byKey.get('rto-RC')?.state, byKey.get('rto-RC')?.note], ['AVAILABLE', 'Transferred']);
  assert.equal(byKey.get('rto-HSRP')?.state, 'NOT_REQUIRED');
  assert.deepEqual([byKey.get('rto-INSURANCE')?.state, byKey.get('rto-INSURANCE')?.note], ['NA', null]);
  assert.equal(byKey.get('rto-CUSTOM')?.label, 'Form 29');
  assert.ok(!checklist.some((item) => item.docIds.includes('vault')));
});

test('vehicle numbers match without spaces, dashes or case', () => {
  assert.equal(normalizeVehicleNumber('CG 04 DM-1005'), 'CG04DM1005');
  assert.equal(normalizeVehicleNumber(' cg04dm1005 '), 'CG04DM1005');
  assert.equal(normalizeVehicleNumber(null), '');
});

test('ZIP file name is built from the plain vehicle number', () => {
  assert.equal(vehicleZipFileName('cg 04/dm 1005'), 'CG04DM1005 - Documents.zip');
  assert.equal(vehicleZipFileName('CG04DM1005', 'Buyer & Sale'), 'CG04DM1005 - Buyer & Sale Documents.zip');
});

test('section filter accepts known sections only', () => {
  assert.equal(parseDocSection(''), null);
  assert.equal(parseDocSection('buyer & sale'), 'Buyer & Sale');
  assert.throws(() => parseDocSection('Secrets'), /Unknown document section/);
});
