import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GST_RATE_PERCENT,
  calculateSellAccountGst,
  calculateSellAccountPaymentSummary,
  deriveSellAccountDealStatus,
  getSellAccountTaxLines,
  normalizeExpenseBreakdown,
  sumExpenseBreakdown,
} from './sellAccountFinance.mjs';

test('older records: 18 percent GST on the margin (not net of expenses) for an intra-state sale', () => {
  const breakdown = calculateSellAccountGst({
    sellAmount: 118000,
    purchaseAmount: 90000,
    expenses: 5000,
    marginBasis: 'SALE_MINUS_PURCHASE',
    taxMode: 'INCLUSIVE',
    sellerState: 'Chhattisgarh',
    purchaserState: 'Chhattisgarh',
  });

  assert.equal(GST_RATE_PERCENT, 18);
  assert.equal(breakdown.marginAmount, 28000);
  assert.equal(breakdown.taxableAmount, 23728.81);
  assert.equal(breakdown.gstAmount, 4271.19);
  assert.equal(breakdown.cgst, 2135.59);
  assert.equal(breakdown.sgst, 2135.6);
  assert.equal(breakdown.igst, 0);
  assert.equal(breakdown.netProfitBeforeGst, 23000);
  assert.equal(breakdown.netProfitAfterGst, 18728.81);
});

test('keeps the entered sell amount payable while calculating GST on profit', () => {
  const breakdown = calculateSellAccountGst({
    sellAmount: 200000,
    purchaseAmount: 100000,
    expenses: 0,
    sellerState: 'Chhattisgarh',
    purchaserState: 'Chhattisgarh',
  });

  assert.equal(breakdown.taxMode, 'INCLUSIVE');
  assert.equal(breakdown.taxableAmount, 84745.76);
  assert.equal(breakdown.gstAmount, 15254.24);
  assert.equal(breakdown.cgst, 7627.12);
  assert.equal(breakdown.sgst, 7627.12);
  assert.equal(breakdown.igst, 0);
  assert.equal(breakdown.grossSaleAmount, 200000);
  assert.equal(breakdown.netProfitBeforeGst, 100000);
  assert.equal(breakdown.netProfitAfterGst, 84745.76);
});

test('older records: IGST for an inter-state sale using inclusive profit tax', () => {
  const breakdown = calculateSellAccountGst({
    sellAmount: 100000,
    purchaseAmount: 60000,
    expenses: 5000,
    marginBasis: 'SALE_MINUS_PURCHASE',
    taxMode: 'EXCLUSIVE',
    sellerState: 'Chhattisgarh',
    purchaserState: 'Maharashtra',
  });

  assert.equal(breakdown.taxableAmount, 33898.31);
  assert.equal(breakdown.gstAmount, 6101.69);
  assert.equal(breakdown.igst, 6101.69);
  assert.equal(breakdown.cgst, 0);
  assert.equal(breakdown.sgst, 0);
  assert.equal(breakdown.grossSaleAmount, 100000);
  assert.equal(breakdown.netProfitBeforeGst, 35000);
  assert.equal(breakdown.netProfitAfterGst, 28898.31);
});

test('older records: still owe GST on a positive margin when expenses turn the deal into a loss', () => {
  const breakdown = calculateSellAccountGst({
    sellAmount: 100000,
    purchaseAmount: 90000,
    expenses: 15000,
    marginBasis: 'SALE_MINUS_PURCHASE',
    sellerState: 'Chhattisgarh',
    purchaserState: 'Chhattisgarh',
  });

  assert.equal(breakdown.taxableAmount, 8474.58);
  assert.equal(breakdown.gstAmount, 1525.42);
  assert.equal(breakdown.netProfitBeforeGst, -5000);
  assert.equal(breakdown.netProfitAfterGst, -6525.42);
});

test('margin after expenses: GST is extracted from sell - purchase - expenses', () => {
  const breakdown = calculateSellAccountGst({
    purchaseAmount: 1000000,
    sellAmount: 1200000,
    expenses: 50000,
    sellerState: 'Chhattisgarh',
    purchaserState: 'Chhattisgarh',
  });
  assert.equal(breakdown.marginBasis, 'AFTER_EXPENSES');
  assert.equal(breakdown.marginAmount, 150000);
  assert.equal(breakdown.taxableAmount, 127118.64);
  assert.equal(breakdown.gstAmount, 22881.36);
  assert.equal(breakdown.cgst + breakdown.sgst, 22881.36);
  assert.equal(breakdown.netProfitBeforeGst, 150000);
  assert.equal(breakdown.netProfitAfterGst, 127118.64);
});

test('margin after expenses: no GST when expenses use up the whole margin', () => {
  const breakdown = calculateSellAccountGst({ sellAmount: 100000, purchaseAmount: 90000, expenses: 15000 });
  assert.equal(breakdown.marginAmount, -5000);
  assert.equal(breakdown.gstAmount, 0);
  assert.equal(breakdown.netProfitAfterGst, -5000);
});

test('does not charge GST when the vehicle is sold below its purchase price', () => {
  const breakdown = calculateSellAccountGst({ sellAmount: 90000, purchaseAmount: 100000, expenses: 2000, marginBasis: 'SALE_MINUS_PURCHASE' });
  assert.equal(breakdown.marginAmount, -10000);
  assert.equal(breakdown.gstAmount, 0);
  assert.equal(breakdown.netProfitAfterGst, -12000);
});

test('matches the 10 lakh to 12 lakh broker example', () => {
  const breakdown = calculateSellAccountGst({ purchaseAmount: 1000000, sellAmount: 1200000, sellerState: 'Chhattisgarh', purchaserState: 'Odisha' });
  assert.equal(breakdown.marginAmount, 200000);
  assert.equal(breakdown.gstAmount, 30508.47);
  assert.equal(breakdown.igst, 30508.47);
  assert.equal(breakdown.netProfitAfterGst, 169491.53);
});

test('nets an exchanged vehicle off the cash receivable', () => {
  const summary = calculateSellAccountPaymentSummary({
    sellAmount: 1200000,
    saleExchangeValue: 300000,
    payments: [{ side: 'PURCHASER_RECEIPT', amount: 900000 }],
  });
  assert.equal(summary.customerCashReceivable, 900000);
  assert.equal(summary.purchaserPaymentStatus, 'FULL');
});

test('sums the itemised expense breakdown', () => {
  const breakdown = normalizeExpenseBreakdown({ transport: '12000', paperwork: 1500, rtoWork: 4000, other: -1, otherLabel: ' Crane ' });
  assert.equal(breakdown.otherLabel, 'Crane');
  assert.equal(sumExpenseBreakdown(breakdown), 17500);
});

test('returns only the applicable GST components for the selected state classification', () => {
  assert.deepEqual(
    getSellAccountTaxLines({ isIntraState: true, cgst: 7627.12, sgst: 7627.12, igst: 0 }),
    [
      { key: 'cgst', label: 'CGST (9%)', ratePercent: 9, amount: 7627.12 },
      { key: 'sgst', label: 'SGST (9%)', ratePercent: 9, amount: 7627.12 },
    ],
  );
  assert.deepEqual(
    getSellAccountTaxLines({ isIntraState: false, cgst: 0, sgst: 0, igst: 15254.24 }),
    [{ key: 'igst', label: 'IGST (18%)', ratePercent: 18, amount: 15254.24 }],
  );
});

test('summarizes purchaser receipts and seller payments without allowing negative balances', () => {
  const summary = calculateSellAccountPaymentSummary({
    sellAmount: 100000,
    purchaseAmount: 70000,
    payments: [
      { side: 'PURCHASER_RECEIPT', amount: 40000 },
      { side: 'PURCHASER_RECEIPT', amount: 70000 },
      { side: 'SELLER_PAYMENT', amount: 20000 },
    ],
  });

  assert.equal(summary.purchaserReceived, 110000);
  assert.equal(summary.purchaserBalance, 0);
  assert.equal(summary.sellerPaid, 20000);
  assert.equal(summary.sellerBalance, 50000);
  assert.equal(summary.purchaserPaymentStatus, 'FULL');
  assert.equal(summary.sellerPaymentStatus, 'PARTIAL');
});

test('uses the entered sell amount as the purchaser payable total even when GST is calculated separately', () => {
  const summary = calculateSellAccountPaymentSummary({
    sellAmount: 200000,
    purchaseAmount: 100000,
    taxMode: 'EXCLUSIVE',
    payments: [{ side: 'PURCHASER_RECEIPT', amount: 200000 }],
  });

  assert.equal(summary.purchaserReceived, 200000);
  assert.equal(summary.purchaserBalance, 0);
  assert.equal(summary.purchaserPaymentStatus, 'FULL');
});

test('derives the deal status from payments and linked RTO progress', () => {
  assert.equal(deriveSellAccountDealStatus({ purchaserPaymentStatus: 'UNPAID', rtoStatus: 'PENDING' }), 'OPEN');
  assert.equal(deriveSellAccountDealStatus({ purchaserPaymentStatus: 'PARTIAL', rtoStatus: 'PENDING' }), 'PARTIAL_PAYMENT_RECEIVED');
  assert.equal(deriveSellAccountDealStatus({ purchaserPaymentStatus: 'FULL', rtoStatus: 'PENDING' }), 'FULL_PAYMENT');
  assert.equal(deriveSellAccountDealStatus({ purchaserPaymentStatus: 'FULL', rtoStatus: 'PENDING', rtoLinked: true }), 'RTO_WORK_IN_PROGRESS');
  assert.equal(deriveSellAccountDealStatus({ purchaserPaymentStatus: 'FULL', rtoStatus: 'IN_PROGRESS' }), 'RTO_WORK_IN_PROGRESS');
  assert.equal(deriveSellAccountDealStatus({ purchaserPaymentStatus: 'FULL', rtoStatus: 'COMPLETED' }), 'DEAL_DONE');
  assert.equal(deriveSellAccountDealStatus({ purchaserPaymentStatus: 'PARTIAL', rtoStatus: 'REJECTED' }), 'RTO_WORK_FAILED');
});
