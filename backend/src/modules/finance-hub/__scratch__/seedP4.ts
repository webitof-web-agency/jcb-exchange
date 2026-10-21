import bcrypt from 'bcryptjs';
import prisma from '../../../lib/prisma';
import * as accounts from '../services/accounts.service';
import * as banks from '../services/bankAccounts.service';
import * as periods from '../services/periods.service';
import { updatePostingSettings } from '../services/settings.service';
import { runPostingTick } from '../posting/worker';
import { getVehicleRegister, getLedgerBalances, getReceiptsRegister } from '../services/vehicleFinance.service';

(async () => {
  if (!String(process.env.DATABASE_URL).includes('127.0.0.1:55432')) throw new Error('throwaway only');
  const ctx = { actorUserId: null, ipAddress: null, userAgent: null };
  await prisma.user.create({ data: { email: 'fh.superadmin@test.local', name: 'FH Test Admin', password: await bcrypt.hash('FhTest#2026', 10), role: 'SUPER_ADMIN', status: 'ACTIVE' } });
  await accounts.installDefaultChart({ dryRun: false }, ctx);
  await periods.createFinancialYear({ startYear: 2026 }, ctx);
  await banks.createBankAccount({ type: 'CURRENT', displayName: 'HDFC Current', accountNumber: '50200012346789' }, ctx, true);
  const buyer = await prisma.user.create({ data: { name: 'Prime Buyer', mobile: '9811111111', role: 'CUSTOMER' } });
  const mk = (data: Record<string, unknown>) => prisma.sellAccount.create({ data: data as never });
  await mk({ recordNumber: 'SA-2026-001', vehicleNumber: 'MH12AB1234', brandName: 'JCB', vehicleModel: '3DX', listingTitle: 'JCB 3DX 2019', sourceType: 'DIRECT_CUSTOMER',
    purchaseAmount: 1000000, sellAmount: 1200000, expenses: 35000, expenseBreakdown: { transport: 20000, paperwork: 5000, rtoWork: 10000, other: 0, otherLabel: '' },
    sellerName: 'Ramesh Patil', sellerNumber: '9876543210', sellerState: 'Maharashtra', purchaserName: 'Suresh Rao', purchaserNumber: '9123456780', purchaserState: 'Gujarat',
    sellerDate: new Date('2026-08-01T06:00:00Z'), invoiceNumber: 'JCB/26-27/0001', invoiceGeneratedAt: new Date('2026-09-10T06:00:00Z'), dealStatus: 'DEAL_DONE',
    payments: { create: [
      { side: 'SELLER_PAYMENT', amount: 1000000, paymentDate: new Date('2026-08-02T06:00:00Z'), method: 'BANK_TRANSFER', reference: 'UTR-S1' },
      { side: 'PURCHASER_RECEIPT', amount: 700000, paymentDate: new Date('2026-09-12T06:00:00Z'), method: 'BANK_TRANSFER', reference: 'UTR-P1' },
    ] } });
  await mk({ recordNumber: 'SA-2026-002', vehicleNumber: 'MH14XY9999', brandName: 'CAT', vehicleModel: '424B', sourceType: 'PARTNER', purchaseAmount: 800000, sellAmount: 0,
    expenses: 12000, expenseBreakdown: { transport: 12000, paperwork: 0, rtoWork: 0, other: 0, otherLabel: '' }, sellerName: 'Om Earthmovers', sellerNumber: '9822222222', sellerDate: new Date('2026-06-15T06:00:00Z'),
    payments: { create: [{ side: 'SELLER_PAYMENT', amount: 300000, paymentDate: new Date('2026-06-16T06:00:00Z'), method: 'BANK_TRANSFER' }] } });
  await mk({ recordNumber: 'SA-2026-003', vehicleNumber: 'GJ01EX0001', brandName: 'JCB', vehicleModel: '4DX', sourceType: 'AGENT', purchaseType: 'EXCHANGE', purchaseExchangeValue: 300000, purchaseExchangeVehicle: 'Old Tata Hitachi',
    saleType: 'EXCHANGE', saleExchangeValue: 400000, saleExchangeVehicle: 'Mahindra EarthMaster', purchaseAmount: 1500000, sellAmount: 1700000, sellerName: 'Mahesh Agent', sellerNumber: '9000000002',
    purchaserName: 'Kiran Infra', purchaserNumber: '9000000003', sellerState: 'Gujarat', purchaserState: 'Gujarat', sellerDate: new Date('2026-09-20T06:00:00Z'), dealStatus: 'DEAL_DONE', completedAt: new Date('2026-10-15T06:00:00Z') });
  await mk({ recordNumber: 'SA-2026-004', vehicleNumber: 'RJ14ZZ0001', sourceType: 'DIRECT_CUSTOMER', purchaseAmount: 0, sellAmount: 0, sellerName: 'Advance Seller', sellerNumber: '9000000004',
    payments: { create: [{ side: 'SELLER_PAYMENT', amount: 50000, paymentDate: new Date('2026-10-01T06:00:00Z'), method: 'BANK_TRANSFER' }] } });
  await mk({ recordNumber: 'SA-2026-005', purchaseAmount: 1, sellAmount: 1, isDraft: true });
  await prisma.customerPrimeSubscription.create({ data: { userId: buyer.id, status: 'ACTIVE', paidAmount: 999, settingsSnapshot: {}, customerState: 'Maharashtra', approvedAt: new Date('2026-10-03T06:00:00Z'), transactionRef: 'UPI-1' } });
  await updatePostingSettings({ postingMode: 'LIVE', reason: 'test' }, ctx);
  console.log('posting:', JSON.stringify(await runPostingTick({ fullSweep: true })));

  const purchases = await getVehicleRegister({ status: 'booked' });
  console.log('purchases:', purchases.total, JSON.stringify(purchases.totals));
  purchases.rows.forEach((row) => console.log('  ', row.recordNumber, row.status, 'landed', row.landedCost, 'profit', row.profit, 'books', JSON.stringify({ has: row.books.hasEntries, profit: row.books.profit, diff: row.books.difference, stock: row.books.stock, clearing: row.books.exchangeClearing })));
  const stockSep = await getVehicleRegister({ status: 'in_stock', asOn: '2026-09-01' });
  console.log('stock on 01-09:', stockSep.rows.map((row) => `${row.recordNumber}:${row.daysInStock}d:${row.landedCost}`).join(' '), JSON.stringify({ units: stockSep.totals.inStock, value: stockSep.totals.stockValue }));
  const sales = await getVehicleRegister({ status: 'sold', dateBasis: 'sale', from: '2026-10-01' });
  console.log('sales from 01-10:', sales.rows.map((row) => row.recordNumber).join(','));
  const advances = await getLedgerBalances({ systemKey: 'SELLER_ADVANCES' });
  console.log('seller advances:', JSON.stringify(advances.balances.map((row) => [row.partyName, row.vehicle, row.balance])));
  const receipts = await getReceiptsRegister({});
  console.log('receipts:', receipts.total, receipts.amount, 'unposted', receipts.unposted, JSON.stringify(receipts.bySource));
  await prisma.$disconnect();
})().catch(async (error) => { console.error('FAILED', error); await prisma.$disconnect(); process.exit(1); });
