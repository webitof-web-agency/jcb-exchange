import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GST_RATE_PERCENT,
  calculateSellAccountGst,
  calculateSellAccountPaymentSummary,
  deriveSellAccountDealStatus,
  getSellAccountTaxLines,
} from './sellAccountFinance.mjs';

test('calculates GST at 18 percent on profit for an intra-state sale', () => {
  const breakdown = calculateSellAccountGst({
    sellAmount: 118000,
    purchaseAmount: 90000,
    expenses: 5000,
    taxMode: 'INCLUSIVE',
    sellerState: 'Chhattisgarh',
    purchaserState: 'Chhattisgarh',
  });

  assert.equal(GST_RATE_PERCENT, 18);
  assert.equal(breakdown.taxableAmount, 19491.53);
  assert.equal(breakdown.gstAmount, 3508.47);
  assert.equal(breakdown.cgst, 1754.24);
  assert.equal(breakdown.sgst, 1754.23);
  assert.equal(breakdown.igst, 0);
  assert.equal(breakdown.netProfitBeforeGst, 23000);
  assert.equal(breakdown.netProfitAfterGst, 19491.53);
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

test('calculates IGST for an inter-state sale using inclusive profit tax', () => {
  const breakdown = calculateSellAccountGst({
    sellAmount: 100000,
    purchaseAmount: 60000,
    expenses: 5000,
    taxMode: 'EXCLUSIVE',
    sellerState: 'Chhattisgarh',
    purchaserState: 'Maharashtra',
  });

  assert.equal(breakdown.taxableAmount, 29661.02);
  assert.equal(breakdown.gstAmount, 5338.98);
  assert.equal(breakdown.igst, 5338.98);
  assert.equal(breakdown.cgst, 0);
  assert.equal(breakdown.sgst, 0);
  assert.equal(breakdown.grossSaleAmount, 100000);
  assert.equal(breakdown.netProfitBeforeGst, 35000);
  assert.equal(breakdown.netProfitAfterGst, 29661.02);
});

test('does not charge GST when purchase cost and expenses exceed the sale amount', () => {
  const breakdown = calculateSellAccountGst({
    sellAmount: 100000,
    purchaseAmount: 90000,
    expenses: 15000,
    sellerState: 'Chhattisgarh',
    purchaserState: 'Chhattisgarh',
  });

  assert.equal(breakdown.taxableAmount, 0);
  assert.equal(breakdown.gstAmount, 0);
  assert.equal(breakdown.netProfitBeforeGst, -5000);
  assert.equal(breakdown.netProfitAfterGst, -5000);
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
