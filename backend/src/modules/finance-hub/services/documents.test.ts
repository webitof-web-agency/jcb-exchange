import assert from 'node:assert/strict';
import test from 'node:test';
import { Prisma, type FinDocumentType } from '@prisma/client';
import { computeDocument, documentVoucherLines, type DocumentLineInput } from './documents.service';
import type { VoucherLineInput } from './ledgerRules';

const D = (value: number) => new Prisma.Decimal(value);
const ZERO = D(0);
const system = (key: string) => `S:${key}`;

const line = (overrides: Partial<DocumentLineInput> = {}): DocumentLineInput => ({
  description: 'Hydraulic pump', accountId: 'L:REPAIRS', hsnSac: '8413', quantity: D(2), rate: D(5000), discount: D(500),
  gstRate: D(18), itcEligible: true, sellAccountId: null, costCentreId: null, ...overrides,
});

const post = (docType: FinDocumentType, lines: DocumentLineInput[], options: { intraState?: boolean; reverseCharge?: boolean; tds?: number; roundOff?: number } = {}) => {
  const computed = computeDocument(lines, { intraState: options.intraState ?? true, roundOff: D(options.roundOff ?? 0), tdsAmount: D(options.tds ?? 0), reverseCharge: options.reverseCharge ?? false });
  const vouchers = documentVoucherLines(docType, computed, { partyId: 'party', reverseCharge: options.reverseCharge ?? false, tdsAmount: D(options.tds ?? 0), roundOff: D(options.roundOff ?? 0), system });
  return { computed, lines: vouchers };
};

const assertBalanced = (lines: VoucherLineInput[]) => {
  const debit = lines.reduce((sum, item) => sum.plus(item.debit), ZERO);
  const credit = lines.reduce((sum, item) => sum.plus(item.credit), ZERO);
  assert.ok(debit.equals(credit), `not balanced: ${debit} vs ${credit}`);
  assert.ok(debit.greaterThan(0));
};
const net = (lines: VoucherLineInput[], accountId: string) => lines.filter((item) => item.accountId === accountId).reduce((sum, item) => sum.plus(item.debit).minus(item.credit), ZERO).toNumber();

test('computeDocument splits GST by supply and nets TDS off the payable', () => {
  const intra = computeDocument([line()], { intraState: true, roundOff: ZERO, tdsAmount: D(95), reverseCharge: false });
  assert.equal(intra.subTotal.toNumber(), 9500);
  assert.equal(intra.cgst.toNumber(), 855);
  assert.equal(intra.sgst.toNumber(), 855);
  assert.equal(intra.igst.toNumber(), 0);
  assert.equal(intra.total.toNumber(), 11210);
  assert.equal(intra.payable.toNumber(), 11115);

  const inter = computeDocument([line()], { intraState: false, roundOff: D(-0.4), tdsAmount: ZERO, reverseCharge: false });
  assert.equal(inter.igst.toNumber(), 1710);
  assert.equal(inter.cgst.toNumber(), 0);
  assert.equal(inter.total.toNumber(), 11209.6);

  const rcm = computeDocument([line()], { intraState: true, roundOff: ZERO, tdsAmount: ZERO, reverseCharge: true });
  assert.equal(rcm.total.toNumber(), 9500, 'supplier is paid the taxable value only');
  assert.equal(rcm.tax.toNumber(), 1710);
});

test('a purchase bill debits the expense and input GST and credits the supplier and TDS', () => {
  const { lines } = post('PURCHASE_BILL', [line()], { tds: 95, roundOff: 0.4 });
  assertBalanced(lines);
  assert.equal(net(lines, 'L:REPAIRS'), 9500);
  assert.equal(net(lines, 'S:GST_INPUT_CGST'), 855);
  assert.equal(net(lines, 'S:GST_INPUT_SGST'), 855);
  assert.equal(net(lines, 'S:TDS_PAYABLE'), -95);
  assert.equal(net(lines, 'S:CREDITORS_CONTROL'), -11115.4);
  assert.equal(net(lines, 'S:ROUND_OFF'), 0.4);
  assert.equal(lines.find((item) => item.accountId === 'S:CREDITORS_CONTROL')?.partyId, 'party');
});

test('GST without input credit becomes part of the purchase cost', () => {
  const { lines } = post('PURCHASE_BILL', [line({ itcEligible: false }), line({ accountId: 'L:SPARES', quantity: D(1), rate: D(1000), discount: ZERO, gstRate: D(5) })], { intraState: false });
  assertBalanced(lines);
  assert.equal(net(lines, 'L:REPAIRS'), 11210);
  assert.equal(net(lines, 'L:SPARES'), 1000);
  assert.equal(net(lines, 'S:GST_INPUT_IGST'), 50);
});

test('reverse charge: supplier gets the taxable value, all GST is payable, only eligible GST is claimed', () => {
  const { lines } = post('PURCHASE_BILL', [line(), line({ accountId: 'L:FOOD', itcEligible: false })], { reverseCharge: true });
  assertBalanced(lines);
  assert.equal(net(lines, 'S:CREDITORS_CONTROL'), -19000);
  assert.equal(net(lines, 'S:GST_RCM_PAYABLE'), -3420);
  assert.equal(net(lines, 'S:GST_INPUT_CGST') + net(lines, 'S:GST_INPUT_SGST'), 1710);
  assert.equal(net(lines, 'L:FOOD'), 11210);
});

test('sales invoice, credit note and debit note post the right way round', () => {
  const invoice = post('SALES_INVOICE', [line({ accountId: 'L:SERVICE' })]).lines;
  assertBalanced(invoice);
  assert.equal(net(invoice, 'S:DEBTORS_CONTROL'), 11210);
  assert.equal(net(invoice, 'L:SERVICE'), -9500);
  assert.equal(net(invoice, 'S:GST_OUTPUT_CGST'), -855);

  const credit = post('CREDIT_NOTE', [line({ accountId: 'L:SERVICE' })]).lines;
  assertBalanced(credit);
  assert.equal(net(credit, 'S:DEBTORS_CONTROL'), -11210);
  assert.equal(net(credit, 'S:GST_OUTPUT_SGST'), 855);

  const debit = post('DEBIT_NOTE', [line()], { roundOff: -0.2 }).lines;
  assertBalanced(debit);
  assert.equal(net(debit, 'S:CREDITORS_CONTROL'), 11209.8);
  assert.equal(net(debit, 'L:REPAIRS'), -9500);
  assert.equal(net(debit, 'S:GST_INPUT_IGST') + net(debit, 'S:GST_INPUT_CGST'), -855);
  assert.equal(net(debit, 'S:ROUND_OFF'), 0.2);
});
