import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculateSellAccountGst,
  calculateSellAccountPaymentSummary,
  deriveSellAccountDealStatus,
  normalizeSellAccountExpenseBreakdown,
  sumSellAccountExpenseBreakdown,
} from './sellAccountFinance';

test('marks a linked pending RTO record as RTO work in progress', () => {
  assert.equal(deriveSellAccountDealStatus('FULL', 'PENDING', true), 'RTO_WORK_IN_PROGRESS');
});

test('does not mark a fully paid Sell Account as RTO started without an explicit link', () => {
  assert.equal(deriveSellAccountDealStatus('FULL', 'PENDING', false), 'FULL_PAYMENT');
});

test('extracts 18% GST from the GST-inclusive margin (10L bought, 12L sold)', () => {
  const gst = calculateSellAccountGst({
    purchaseAmount: 1000000,
    sellAmount: 1200000,
    sellerState: 'Chhattisgarh',
    purchaserState: 'Chhattisgarh',
  });
  assert.equal(gst.marginAmount, 200000);
  assert.equal(gst.taxableAmount, 169491.53);
  assert.equal(gst.gstAmount, 30508.47);
  assert.equal(gst.cgst + gst.sgst, 30508.47);
  assert.equal(gst.igst, 0);
  assert.equal(gst.netProfitAfterGst, 169491.53);
});

test('takes the GST-inclusive margin after purchase and expenses (10L bought, 12L sold, 50k expenses)', () => {
  const gst = calculateSellAccountGst({
    purchaseAmount: 1000000,
    sellAmount: 1200000,
    expenses: 50000,
    sellerState: 'Chhattisgarh',
    purchaserState: 'Maharashtra',
  });
  assert.equal(gst.marginBasis, 'AFTER_EXPENSES');
  assert.equal(gst.marginAmount, 150000);
  assert.equal(gst.gstAmount, 22881.36);
  assert.equal(gst.igst, 22881.36);
  assert.equal(gst.netProfitBeforeGst, 150000);
  assert.equal(gst.netProfitAfterGst, 127118.64);
});

test('older records keep expenses out of the GST base and deduct them from the final profit', () => {
  const gst = calculateSellAccountGst({
    purchaseAmount: 1000000,
    sellAmount: 1200000,
    expenses: 20000,
    marginBasis: 'SALE_MINUS_PURCHASE',
    sellerState: 'Chhattisgarh',
    purchaserState: 'Maharashtra',
  });
  assert.equal(gst.gstAmount, 30508.47);
  assert.equal(gst.igst, 30508.47);
  assert.equal(gst.netProfitBeforeGst, 180000);
  assert.equal(gst.netProfitAfterGst, 149491.53);
});

test('reduces the cash receivable by the value of a vehicle taken in exchange', () => {
  const summary = calculateSellAccountPaymentSummary({
    sellAmount: 1200000,
    saleExchangeValue: 300000,
    purchaseAmount: 1000000,
    payments: [{ side: 'PURCHASER_RECEIPT', amount: 900000 }],
  });
  assert.equal(summary.customerCashReceivable, 900000);
  assert.equal(summary.purchaserBalance, 0);
  assert.equal(summary.purchaserPaymentStatus, 'FULL');
});

test('sums an itemised expense breakdown and ignores invalid values', () => {
  const breakdown = normalizeSellAccountExpenseBreakdown({ transport: '15000', paperwork: 2500, rtoWork: -10, other: 'x', otherLabel: ' Crane ' });
  assert.ok(breakdown);
  assert.equal(breakdown.otherLabel, 'Crane');
  assert.equal(sumSellAccountExpenseBreakdown(breakdown), 17500);
  assert.equal(normalizeSellAccountExpenseBreakdown(null), null);
});

test('only issued customer receipts count; drafts are pending and refunds come off', () => {
  const summary = calculateSellAccountPaymentSummary({
    sellAmount: 400000,
    purchaseAmount: 300000,
    payments: [
      { side: 'PURCHASER_RECEIPT', amount: 150000, receiptStatus: 'ISSUED' },
      { side: 'PURCHASER_RECEIPT', amount: 100000, receiptStatus: 'DRAFT' },
      { side: 'PURCHASER_RECEIPT', amount: 50000, receiptStatus: 'CANCELLED' },
      { side: 'PURCHASER_RECEIPT', amount: 300000 },
    ],
    refunds: [
      { status: 'PAID', amount: 40000 },
      { status: 'REQUESTED', amount: 5000 },
      { status: 'REJECTED', amount: 99999 },
    ],
  });
  // Missing status = issued (records saved before draft receipts existed).
  assert.equal(summary.purchaserReceivedGross, 450000);
  assert.equal(summary.purchaserDraftPending, 100000);
  assert.equal(summary.purchaserRefunded, 40000);
  assert.equal(summary.purchaserReceived, 410000);
  assert.equal(summary.purchaserPaymentStatus, 'FULL');
  assert.equal(summary.purchaserRefundPending, 5000);
  assert.equal(summary.purchaserRefundable, 5000, 'overpaid 10,000 less 5,000 already requested');
});

test('a draft receipt alone keeps the deal unpaid', () => {
  const summary = calculateSellAccountPaymentSummary({ sellAmount: 400000, payments: [{ side: 'PURCHASER_RECEIPT', amount: 400000, receiptStatus: 'DRAFT' }] });
  assert.equal(summary.purchaserReceived, 0);
  assert.equal(summary.purchaserPaymentStatus, 'UNPAID');
  assert.equal(summary.purchaserBalance, 400000);
});

test('a cancelled deal expects nothing more and everything held is refundable', () => {
  const summary = calculateSellAccountPaymentSummary({
    sellAmount: 400000,
    cancelled: true,
    payments: [{ side: 'PURCHASER_RECEIPT', amount: 100000, receiptStatus: 'ISSUED' }],
    refunds: [{ status: 'PAID', amount: 60000, forfeitAmount: 10000 }],
  });
  assert.equal(summary.customerCashReceivable, 0);
  assert.equal(summary.purchaserBalance, 0);
  assert.equal(summary.purchaserForfeited, 10000);
  assert.equal(summary.purchaserReceived, 30000);
  assert.equal(summary.purchaserRefundable, 30000);
});
