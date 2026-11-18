import assert from 'node:assert/strict';
import test from 'node:test';
import { reconcileSoldVehicleFinancials } from './soldVehicleFinancialReconciliation.service';

test('reconciles sold vehicle money using real receipts, refunds and duplicate protection', () => {
  const result = reconcileSoldVehicleFinancials({
    purchaseAmount: 1_000_000,
    sellAmount: 1_250_000,
    expenses: 2_500,
    gstRatePercent: 18,
    taxMode: 'INCLUSIVE',
    marginBasis: 'AFTER_EXPENSES',
    sellerState: 'CG',
    purchaserState: 'CG',
    payments: [
      { id: 'customer-real-1', side: 'PURCHASER_RECEIPT', amount: 1_000_000, receiptStatus: 'ISSUED', reference: 'UTR-1' },
      { id: 'customer-real-1', side: 'PURCHASER_RECEIPT', amount: 1_000_000, receiptStatus: 'ISSUED', reference: 'UTR-1' },
      { id: 'customer-draft-1', side: 'PURCHASER_RECEIPT', amount: 100_000, receiptStatus: 'DRAFT' },
      { id: 'seller-real-1', side: 'SELLER_PAYMENT', amount: 600_000, receiptStatus: 'ISSUED', reference: 'UTR-SELLER-1' },
      { id: 'seller-draft-1', side: 'SELLER_PAYMENT', amount: 50_000, receiptStatus: 'DRAFT' },
      { id: 'seller-cancelled-1', side: 'SELLER_PAYMENT', amount: 25_000, receiptStatus: 'CANCELLED' },
    ],
    refunds: [
      { id: 'refund-requested-1', status: 'REQUESTED', amount: 50_000, forfeitAmount: 0 },
      { id: 'refund-paid-1', status: 'PAID', amount: 20_000, forfeitAmount: 0 },
      { id: 'refund-rejected-1', status: 'REJECTED', amount: 10_000, forfeitAmount: 0 },
    ],
    source: { balanceAmount: 250_000, netProfit: 247_500, netProfitAfterGst: 210_000 },
  });

  assert.equal(result.amounts.tradeMargin, 250_000);
  assert.equal(result.amounts.profitBeforeGst, 247_500);
  assert.equal(result.amounts.gst.amount, 37_754.24);
  assert.equal(result.amounts.profitAfterGst, 209_745.76);
  assert.equal(result.amounts.result, 'PROFIT');
  assert.equal(result.payments.customer.realAmount, 1_000_000);
  assert.equal(result.payments.customer.draftAmount, 100_000);
  assert.equal(result.payments.customer.refundedAmount, 20_000);
  assert.equal(result.payments.customer.netReceived, 980_000);
  assert.equal(result.payments.customer.balance, 270_000);
  assert.equal(result.payments.seller.realAmount, 600_000);
  assert.equal(result.payments.seller.draftAmount, 50_000);
  assert.equal(result.payments.seller.balance, 400_000);
  assert.equal(result.refunds.paidAmount, 20_000);
  assert.equal(result.refunds.pendingAmount, 50_000);
  assert.equal(result.duplicatePrevention.duplicateCount, 1);
  assert.deepEqual(result.duplicatePrevention.ignoredPaymentIds, ['customer-real-1']);
  assert.equal(result.receipts.realCount, 2);
  assert.equal(result.receipts.draftCount, 2);
  assert.equal(result.receipts.cancelledCount, 1);
  assert.equal(result.reconciliation.status, 'MISMATCH');
  assert.ok(result.reconciliation.warnings.some((warning) => warning.includes('balanceAmount')));
  assert.ok(result.reconciliation.warnings.some((warning) => warning.includes('netProfitAfterGst')));
});

test('does not count cancelled or draft receipts and uses exchange values for cash balances', () => {
  const result = reconcileSoldVehicleFinancials({
    purchaseAmount: 900_000,
    sellAmount: 1_000_000,
    expenses: 10_000,
    purchaseExchangeValue: 200_000,
    saleExchangeValue: 300_000,
    payments: [
      { id: 'customer-1', side: 'PURCHASER_RECEIPT', amount: 700_000, receiptStatus: 'ISSUED' },
      { id: 'customer-2', side: 'PURCHASER_RECEIPT', amount: 100_000, receiptStatus: 'CANCELLED' },
      { id: 'customer-3', side: 'PURCHASER_RECEIPT', amount: 100_000, receiptStatus: 'DRAFT' },
      { id: 'seller-1', side: 'SELLER_PAYMENT', amount: 650_000, receiptStatus: 'ISSUED' },
    ],
    refunds: [],
  });

  assert.equal(result.payments.customer.expectedAmount, 700_000);
  assert.equal(result.payments.customer.realAmount, 700_000);
  assert.equal(result.payments.customer.balance, 0);
  assert.equal(result.payments.seller.expectedAmount, 700_000);
  assert.equal(result.payments.seller.balance, 50_000);
  assert.equal(result.payments.customer.draftAmount, 100_000);
  assert.equal(result.payments.customer.cancelledAmount, 100_000);
});
