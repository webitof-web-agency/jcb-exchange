import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateSellAccountPaymentSummary } from './sellAccountFinance.mjs';
import { getSellAccountPaymentBalances, getSellAccountPaymentsForSide } from './sellAccountPaymentPresentation.mjs';

test('keeps customer receipts and seller payments in separate views', () => {
  const payments = [
    { id: 'customer-1', side: 'PURCHASER_RECEIPT', amount: 2000 },
    { id: 'seller-1', side: 'SELLER_PAYMENT', amount: 1000 },
  ];

  assert.deepEqual(getSellAccountPaymentsForSide(payments, 'PURCHASER_RECEIPT'), [payments[0]]);
  assert.deepEqual(getSellAccountPaymentsForSide(payments, 'SELLER_PAYMENT'), [payments[1]]);
});

test('shows the remaining customer balance after a payment is added', () => {
  const summary = calculateSellAccountPaymentSummary({
    sellAmount: 2000,
    purchaseAmount: 1000,
    payments: [{ side: 'PURCHASER_RECEIPT', amount: 500 }],
  });

  assert.deepEqual(getSellAccountPaymentBalances(summary), {
    customer: { label: 'Balance', amount: 1500 },
    seller: { label: 'Balance', amount: 1000 },
  });
});

test('restores the deleted payment amount to the remaining customer balance', () => {
  const summaryAfterDelete = calculateSellAccountPaymentSummary({
    sellAmount: 2000,
    purchaseAmount: 1000,
    payments: [],
  });

  assert.equal(getSellAccountPaymentBalances(summaryAfterDelete).customer.amount, 2000);
});
