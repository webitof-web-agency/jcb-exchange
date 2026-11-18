import assert from 'node:assert/strict';
import test from 'node:test';
import { compareSoldVehicleSource, buildPhase10Report } from './soldVehiclePhase10Validation.service';

test('compares source financial, payment, refund and relationship values with the AI read model', () => {
  const result = compareSoldVehicleSource({
    source: {
      id: 'deal-1', recordNumber: 'SA-001', listingId: 'listing-1', rtoRecordId: 'rto-1',
      purchaseAmount: 100, sellAmount: 150, expenses: 10, balanceAmount: 50, netProfit: 40, netProfitAfterGst: 32,
      payments: [{ id: 'payment-1', amount: 100, receiptStatus: 'ISSUED' }],
      refunds: [{ id: 'refund-1', amount: 5, status: 'PAID' }],
    },
    detail: {
      deal: { id: 'deal-1', recordNumber: 'SA-001', listingId: 'listing-1', purchaseAmount: 100, sellAmount: 150, expenses: 10, balanceAmount: 50, netProfit: 40, netProfitAfterGst: 32 },
      payments: { items: [{ id: 'payment-1', amount: 100, receiptStatus: 'ISSUED' }] },
      refunds: { items: [{ id: 'refund-1', amount: 5, status: 'PAID' }] },
      relationships: { listingId: 'listing-1', rtoRecordId: 'rto-1' },
    },
  });

  assert.equal(result.status, 'PASS');
  assert.equal(result.mismatchCount, 0);
  assert.equal(result.checkedFieldCount, 14);
});

test('phase 10 report remains incomplete when a required production gate is unresolved', () => {
  const report = buildPhase10Report([
    { id: 'database_comparison', status: 'PASS', evidence: 'source and projection matched' },
    { id: 'pdf_delivery', status: 'EXTERNAL', evidence: 'authenticated browser not run' },
  ]);
  assert.equal(report.status, 'INCOMPLETE');
  assert.ok(report.unresolvedCriticalGates.includes('pdf_delivery'));
});
