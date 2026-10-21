import assert from 'node:assert/strict';
import test from 'node:test';
import { Prisma } from '@prisma/client';
import { calculateSellAccountGst } from '../../../services/sellAccountFinance';
import { summarizeDeal } from './vehicleFinance.service';

const D = (value: number) => new Prisma.Decimal(value);
const at = (value: string) => new Date(`${value}T06:00:00.000Z`);
const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

const deal = (overrides: Record<string, unknown> = {}) => ({
  id: 'sa1', recordNumber: 'SA-1', listingId: null, listingTitle: 'JCB 3DX', vehicleNumber: 'MH12', chassisNumber: null, vehicleType: null, brandName: 'JCB', vehicleModel: '3DX',
  sellerName: 'Ramesh', sellerNumber: null, sellerState: 'Maharashtra', purchaserName: 'Suresh', purchaserNumber: null, purchaserState: 'Gujarat',
  sourceType: 'DIRECT_CUSTOMER', purchaseType: 'PURCHASE', saleType: 'SELL', purchaseAmount: D(1000000), sellAmount: D(1200000), purchaseExchangeValue: D(0), purchaseExchangeVehicle: null,
  saleExchangeValue: D(0), saleExchangeVehicle: null, brokerName: null, expenses: D(35000), expenseBreakdown: { transport: 20000, paperwork: 5000, rtoWork: 10000, other: 0, otherLabel: '' },
  netProfitAfterGst: D(0), isDraft: false, deletedAt: null, isLocked: false, dealStatus: 'DEAL_DONE', rtoStatusSnapshot: 'PENDING', invoiceNumber: 'INV-1',
  invoiceGeneratedAt: at('2026-10-10'), completedAt: null, sellerDate: at('2026-09-01'), purchaserDate: null, sellDate: null, createdAt: at('2026-09-01'), updatedAt: at('2026-10-10'),
  payments: [
    { id: 'p1', side: 'SELLER_PAYMENT', amount: D(600000), paymentDate: at('2026-09-02'), method: 'BANK_TRANSFER', reference: null, note: null },
    { id: 'p2', side: 'PURCHASER_RECEIPT', amount: D(1200000), paymentDate: at('2026-10-12'), method: 'UPI', reference: null, note: null },
  ],
  ...overrides,
}) as unknown as Parameters<typeof summarizeDeal>[0];

test('summarizeDeal matches the Sold Vehicles GST and profit calculation', () => {
  const summary = summarizeDeal(deal(), day('2026-10-21'));
  const gst = calculateSellAccountGst({ sellAmount: 1200000, purchaseAmount: 1000000, expenses: 35000, sellerState: 'Maharashtra', purchaserState: 'Gujarat' });
  assert.equal(summary.profit, gst.netProfitAfterGst);
  assert.equal(summary.gstAmount, gst.gstAmount);
  assert.equal(summary.igst, gst.gstAmount, 'inter-state → IGST');
  assert.equal(summary.landedCost, 1035000);
  assert.deepEqual(summary.costs.map((cost) => cost.head), ['transport', 'paperwork', 'rtoWork']);
  assert.equal(summary.status, 'SOLD');
  assert.equal(summary.daysInStock, 39, '1 Sep → 10 Oct');
  assert.equal(summary.sellerBalance, 400000);
  assert.equal(summary.purchaserBalance, 0);
  assert.equal(summary.saleExGst, Math.round((1200000 - gst.gstAmount) * 100) / 100);
});

test('stock status follows the as-on date', () => {
  assert.equal(summarizeDeal(deal(), day('2026-10-05')).status, 'IN_STOCK');
  assert.equal(summarizeDeal(deal(), day('2026-10-05')).daysInStock, 34);
  assert.equal(summarizeDeal(deal(), day('2026-08-15')).status, 'NOT_BOOKED', 'not bought yet');
  assert.equal(summarizeDeal(deal({ invoiceGeneratedAt: null, dealStatus: 'RTO_WORK_IN_PROGRESS' }), day('2026-12-01')).status, 'IN_STOCK');
  assert.equal(summarizeDeal(deal({ isDraft: true }), day('2026-12-01')).status, 'DRAFT');
});

test('exchange values reduce the cash balances like the Sold Vehicles screen', () => {
  const summary = summarizeDeal(deal({ saleType: 'EXCHANGE', saleExchangeValue: D(200000), payments: [] }), day('2026-10-21'));
  assert.equal(summary.saleExchangeValue, 200000);
  assert.equal(summary.purchaserBalance, 1000000);
  const ignored = summarizeDeal(deal({ saleType: 'SELL', saleExchangeValue: D(200000), payments: [] }), day('2026-10-21'));
  assert.equal(ignored.saleExchangeValue, 0, 'value is ignored unless the sale type is exchange');
});
