import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildSoldVehicleAnalytics,
  buildSoldVehicleForecast,
  type SoldVehicleAnalyticsDeal,
} from './soldVehicleAnalytics.service';

const day = (value: string) => new Date(`${value}T12:00:00.000Z`);

const deal = (overrides: Partial<SoldVehicleAnalyticsDeal> = {}): SoldVehicleAnalyticsDeal => ({
  id: 'deal-1',
  recordNumber: 'SA-001',
  listingId: 'listing-1',
  vehicleNumber: 'CG04AB1234',
  brandName: 'JCB',
  vehicleModel: '3DX',
  purchaseAmount: 100,
  sellAmount: 150,
  expenses: 10,
  purchaseExchangeValue: 0,
  saleExchangeValue: 0,
  gstRatePercent: 18,
  taxMode: 'INCLUSIVE',
  marginBasis: 'AFTER_EXPENSES',
  sellerState: 'Chhattisgarh',
  purchaserState: 'Chhattisgarh',
  balanceAmount: 100,
  netProfit: 40,
  netProfitAfterGst: 32,
  isDraft: false,
  cancelledAt: null,
  completedAt: day('2026-11-10'),
  sellDate: day('2026-11-10'),
  createdAt: day('2026-11-01'),
  dealStatus: 'DEAL_DONE',
  expenseBreakdown: { transport: 10 },
  documents: { purchaseDeed: { fileName: 'purchase.pdf' } },
  payments: [
    { id: 'payment-1', side: 'PURCHASER_RECEIPT', amount: 50, receiptStatus: 'ISSUED', paymentDate: day('2026-11-10') },
  ],
  refunds: [],
  rtoRecord: {
    id: 'rto-1',
    rtoStatus: 'PENDING',
    createdAt: day('2026-11-10'),
    updatedAt: day('2026-11-20'),
    documentSendDate: null,
    statusLogs: [],
    transferTasks: [{ id: 'task-1', taskKey: 'rc', label: 'RC Transfer', status: 'PENDING', isOptional: false, documents: null, createdAt: day('2026-11-10'), updatedAt: day('2026-11-20') }],
  },
  listing: { brandName: 'JCB', modelName: '3DX' },
  ...overrides,
});

test('builds exact Sold Vehicle analytics with financial, collection, RTO and document evidence', () => {
  const result = buildSoldVehicleAnalytics({
    deals: [
      deal(),
      deal({
        id: 'deal-2',
        recordNumber: 'SA-002',
        vehicleModel: '3DX Super',
        vehicleNumber: 'CG04AB5678',
        sellDate: day('2026-11-11'),
        completedAt: day('2026-11-11'),
        purchaseAmount: 140,
        sellAmount: 130,
        expenses: 5,
        netProfitAfterGst: -15,
        payments: [],
        rtoRecord: null,
        documents: {},
      }),
      deal({ id: 'cancelled', recordNumber: 'SA-CANCELLED', cancelledAt: day('2026-11-12') }),
    ],
    from: day('2026-11-01'),
    to: day('2026-11-30'),
    metric: 'overview',
    lowMarginThresholdPercent: 5,
  });

  assert.equal(result.status, 'READY');
  assert.deepEqual(result.dateRange, { from: '2026-11-01', to: '2026-11-30' });
  assert.equal(result.summary.eligibleDeals, 2);
  assert.equal(result.summary.excludedDeals, 1);
  assert.equal(result.financials.saleAmount, 280);
  assert.equal(result.financials.lossDeals, 1);
  assert.equal(result.payments.customer.outstanding, 230);
  assert.equal(result.lowMarginDeals.count, 1);
  assert.equal(result.collectionRisk.highRiskCount, 1);
  assert.equal(result.rtoDelay.pendingDealCount, 1);
  assert.equal(result.documents.missingDealCount, 1);
  assert.equal(result.modelPerformance.items.length, 2);
  assert.equal(result.modelPerformance.items[0]?.model, '3DX');
  assert.equal(result.monthlyComparison.current.period, '2026-11');
  assert.ok(result.suggestions.some((item) => /collection|outstanding/i.test(item.title)));
});

test('forecast returns assumptions, date range, confidence and insufficient-data state without guessing', () => {
  const result = buildSoldVehicleForecast({
    deals: Array.from({ length: 7 }, (_, index) => deal({
      id: `deal-${index}`,
      recordNumber: `SA-${index}`,
      sellDate: day(`2026-11-${String(index + 1).padStart(2, '0')}`),
      completedAt: day(`2026-11-${String(index + 1).padStart(2, '0')}`),
      payments: [{ id: `payment-${index}`, side: 'PURCHASER_RECEIPT', amount: 150, receiptStatus: 'ISSUED', paymentDate: day(`2026-11-${String(index + 1).padStart(2, '0')}`) }],
    })),
    from: day('2026-11-01'),
    to: day('2026-11-07'),
    horizonDays: 7,
  });

  assert.equal(result.status, 'READY');
  assert.equal(result.historical.dateRange.from, '2026-11-01');
  assert.equal(result.historical.dateRange.to, '2026-11-07');
  assert.equal(result.forecast.daily.length, 7);
  assert.ok(result.confidence.score >= 0 && result.confidence.score <= 100);
  assert.ok(result.assumptions.length > 0);
  assert.match(result.method, /baseline|trend/i);

  const insufficient = buildSoldVehicleForecast({ deals: [deal()], from: day('2026-11-01'), to: day('2026-11-02'), horizonDays: 7 });
  assert.equal(insufficient.status, 'INSUFFICIENT_DATA');
  assert.ok(insufficient.limitations.some((item) => /7 daily observations/i.test(item)));
});

test('keeps an exact older deal addressable and compares the selected period with the previous period', () => {
  const current = deal({ id: 'current', recordNumber: 'SA-CURRENT', sellDate: day('2026-11-10'), completedAt: day('2026-11-10') });
  const previous = deal({ id: 'previous', recordNumber: 'SA-PREVIOUS', sellDate: day('2026-10-10'), completedAt: day('2026-10-10'), sellAmount: 100 });
  const exact = buildSoldVehicleAnalytics({
    deals: [deal({ id: 'old', recordNumber: 'SA-OLD', sellDate: day('2026-01-10'), completedAt: day('2026-01-10') })],
    from: day('2026-11-01'),
    to: day('2026-11-30'),
    exactDeal: true,
    metric: 'payments',
  });
  assert.equal(exact.summary.eligibleDeals, 1);

  const comparison = buildSoldVehicleAnalytics({
    deals: [current, previous],
    from: day('2026-11-01'),
    to: day('2026-11-30'),
    metric: 'monthly_comparison',
  });
  assert.equal(comparison.monthlyComparison.current.deals, 1);
  assert.equal(comparison.monthlyComparison.previous.deals, 1);
  assert.equal(comparison.monthlyComparison.changePercent.revenue, 50);
});
