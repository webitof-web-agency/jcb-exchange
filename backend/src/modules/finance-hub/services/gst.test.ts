import assert from 'node:assert/strict';
import test from 'node:test';
import { gstr1Section, match2b, parse2bJson, setOff } from './gstRules';

test('GSTR-1 sections', () => {
  assert.equal(gstr1Section({ gstin: '27AAAAA0000A1Z5', isNote: false, interState: false, invoiceValue: 50000 }), 'B2B');
  assert.equal(gstr1Section({ gstin: null, isNote: false, interState: true, invoiceValue: 150000 }), 'B2CL');
  assert.equal(gstr1Section({ gstin: null, isNote: false, interState: true, invoiceValue: 90000 }), 'B2CS');
  assert.equal(gstr1Section({ gstin: null, isNote: false, interState: false, invoiceValue: 900000 }), 'B2CS');
  assert.equal(gstr1Section({ gstin: '27AAAAA0000A1Z5', isNote: true, interState: false, invoiceValue: -100 }), 'CDNR');
  assert.equal(gstr1Section({ gstin: null, isNote: true, interState: false, invoiceValue: -100 }), 'CDNUR');
});

test('set-off: IGST credit first, CGST and SGST never cross', () => {
  const result = setOff({ igst: 1000, cgst: 300, sgst: 100 }, { igst: 600, cgst: 500, sgst: 400 });
  assert.deepEqual(result.uses, [
    { from: 'igst', to: 'igst', amount: 600 },
    { from: 'igst', to: 'cgst', amount: 400 },
    { from: 'cgst', to: 'cgst', amount: 100 },
    { from: 'sgst', to: 'sgst', amount: 100 },
  ]);
  assert.deepEqual(result.cashPayable, { igst: 0, cgst: 0, sgst: 300 });
  assert.deepEqual(result.creditCarriedForward, { igst: 0, cgst: 200, sgst: 0 });
  const cross = setOff({ igst: 0, cgst: 500, sgst: 0 }, { igst: 200, cgst: 100, sgst: 300 });
  assert.deepEqual(cross.cashPayable, { igst: 0, cgst: 0, sgst: 300 }, 'CGST credit never pays SGST');
  assert.deepEqual(cross.creditCarriedForward, { igst: 0, cgst: 200, sgst: 0 });
});

test('GSTR-2B match by GSTIN + invoice number, ₹1 tolerance', () => {
  const books = [
    { key: 'b1', gstin: '27AAAAA0000A1Z5', invoiceNo: 'INV/001', date: '2026-10-01', taxable: 1000, tax: 180 },
    { key: 'b2', gstin: '27AAAAA0000A1Z5', invoiceNo: 'INV-002', date: '2026-10-02', taxable: 2000, tax: 360 },
    { key: 'b3', gstin: '29BBBBB0000B1Z5', invoiceNo: '77', date: '2026-10-03', taxable: 500, tax: 90 },
  ];
  const portal = [
    { gstin: '27aaaaa0000a1z5', invoiceNo: 'inv001', date: '2026-10-01', taxable: 1000, igst: 0, cgst: 90.4, sgst: 90 },
    { gstin: '27AAAAA0000A1Z5', invoiceNo: 'INV002', date: '2026-10-02', taxable: 2000, igst: 0, cgst: 150, sgst: 150 },
    { gstin: '24CCCCC0000C1Z5', invoiceNo: 'X9', date: '2026-10-05', taxable: 100, igst: 18, cgst: 0, sgst: 0 },
  ];
  const result = match2b(books, portal);
  assert.deepEqual(result.map((row) => row.status), ['MATCHED', 'AMOUNT_MISMATCH', 'ONLY_IN_2B', 'ONLY_IN_BOOKS']);
  assert.equal(result[1]!.taxDifference, -60);
});

test('reads the portal GSTR-2B JSON', () => {
  const rows = parse2bJson({ data: { docdata: { b2b: [{ ctin: '27AAAAA0000A1Z5', trdnm: 'Supplier', inv: [{ inum: 'S-1', dt: '05-10-2026', items: [{ txval: 1000, cgst: 90, sgst: 90 }, { txval: 500, igst: 0, cgst: 45, sgst: 45 }] }] }] } } });
  assert.deepEqual(rows, [{ gstin: '27AAAAA0000A1Z5', supplierName: 'Supplier', invoiceNo: 'S-1', date: '2026-10-05', taxable: 1500, igst: 0, cgst: 135, sgst: 135 }]);
});
