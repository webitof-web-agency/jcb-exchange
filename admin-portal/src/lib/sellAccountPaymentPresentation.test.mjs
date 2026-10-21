import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateSellAccountPaymentSummary } from './sellAccountFinance.mjs';
import { getSellAccountPaymentBalances } from './sellAccountPaymentPresentation.mjs';

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
