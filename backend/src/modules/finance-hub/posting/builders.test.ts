import assert from 'node:assert/strict';
import test from 'node:test';
import { Prisma } from '@prisma/client';
import { calculateSellAccountGst } from '../../../services/sellAccountFinance';
import { buildAccountLookup } from './sync';
import {
  buildCustomerPrimeVouchers,
  buildListingPaymentVouchers,
  buildPartnerDepositVouchers,
  buildSellAccountVouchers,
  buildWalletRechargeVouchers,
  buildWalletUsageVouchers,
  istDay,
  splitInclusiveGst,
  voucherHash,
  type AccountLookup,
  type DealTerms,
  type DesiredVoucher,
  type SellAccountSource,
} from './builders';

const D = (value: number) => new Prisma.Decimal(value);
const accounts: AccountLookup = { system: (key) => `S:${key}`, code: (code) => `C:${code}`, cashBank: (source, method) => `B:${source}:${method}` };
const booksBegin = new Date('2026-04-01T00:00:00.000Z');
const at = (value: string) => new Date(`${value}T06:00:00.000Z`);

const deal = (overrides: Partial<SellAccountSource> = {}): SellAccountSource => ({
  id: 'sa1', recordNumber: 'SA-2026-001', vehicleNumber: 'MH12AB1234', listingTitle: 'JCB 3DX', sourceType: 'DIRECT_CUSTOMER',
  purchaseType: 'PURCHASE', saleType: 'SELL', purchaseAmount: D(1000000), sellAmount: D(1200000), purchaseExchangeValue: D(0), saleExchangeValue: D(0),
  expenses: D(35000), expenseBreakdown: { transport: 20000, paperwork: 5000, rtoWork: 10000, other: 0, otherLabel: '' }, marginBasis: 'AFTER_EXPENSES',
  sellerState: 'Maharashtra', purchaserState: 'Maharashtra', isDraft: false, deletedAt: null, dealStatus: 'DEAL_DONE', invoiceNumber: 'JCB/26-27/0001',
  invoiceGeneratedAt: at('2026-10-10'), completedAt: null, sellerDate: at('2026-09-01'), purchaserDate: null, sellDate: null,
  createdAt: at('2026-09-01'), updatedAt: at('2026-10-10'),
  payments: [
    { id: 'p1', side: 'SELLER_PAYMENT', amount: D(1000000), paymentDate: at('2026-09-02'), method: 'BANK_TRANSFER', reference: 'UTR1' },
    { id: 'p2', side: 'PURCHASER_RECEIPT', amount: D(200000), paymentDate: at('2026-10-01'), method: 'UPI', reference: null },
    { id: 'p3', side: 'PURCHASER_RECEIPT', amount: D(1000000), paymentDate: at('2026-10-12'), method: 'BANK_TRANSFER', reference: 'UTR2' },
  ],
  ...overrides,
});
const ctx = (extra = {}) => ({ accounts, sellerPartyId: 'seller', purchaserPartyId: 'buyer', booksBegin, capitaliseCosts: true, ...extra });

const totals = (voucher: DesiredVoucher) => voucher.lines.reduce((sum, line) => ({ debit: sum.debit.plus(line.debit), credit: sum.credit.plus(line.credit) }), { debit: D(0), credit: D(0) });
const assertBalanced = (vouchers: DesiredVoucher[]) => vouchers.forEach((voucher) => {
  const sums = totals(voucher);
  assert.ok(sums.debit.equals(sums.credit), `${voucher.key} is not balanced: ${sums.debit} vs ${sums.credit}`);
  assert.ok(sums.debit.greaterThan(0), `${voucher.key} is empty`);
});
const byKey = (vouchers: DesiredVoucher[], key: string) => vouchers.find((voucher) => voucher.key === key)!;
const net = (vouchers: DesiredVoucher[], accountId: string) => vouchers.flatMap((voucher) => voucher.lines).filter((line) => line.accountId === accountId).reduce((sum, line) => sum.plus(line.debit).minus(line.credit), D(0));

test('a full Sold Vehicle deal produces balanced purchase, cost, sale, COGS and payment vouchers', () => {
  const vouchers = buildSellAccountVouchers(deal(), ctx());
  assert.deepEqual(vouchers.map((voucher) => voucher.key).sort(), ['ADVANCE_ADJUST', 'COGS', 'COSTS', 'PURCHASE', 'RECEIPT:p2', 'RECEIPT:p3', 'SALE', 'SELLER_PAYMENT:p1'].sort());
  assertBalanced(vouchers);

  const sale = byKey(vouchers, 'SALE');
  assert.equal(sale.date.toISOString().slice(0, 10), '2026-10-10');
  const gst = calculateSellAccountGst({ sellAmount: 1200000, purchaseAmount: 1000000, expenses: 35000, sellerState: 'Maharashtra', purchaserState: 'Maharashtra' });
  assert.equal(net(vouchers, 'S:GST_OUTPUT_CGST').negated().toFixed(2), gst.cgst.toFixed(2));
  assert.equal(net(vouchers, 'S:GST_OUTPUT_SGST').negated().toFixed(2), gst.sgst.toFixed(2));
  assert.equal(net(vouchers, 'S:GST_OUTPUT_IGST').toNumber(), 0);

  // Vehicle profit in the books equals the Sold Vehicles netProfitAfterGst.
  const income = net(vouchers, 'S:VEHICLE_SALES_MARGIN').negated();
  const cogs = net(vouchers, 'S:COGS_VEHICLES');
  assert.equal(income.minus(cogs).toFixed(2), gst.netProfitAfterGst.toFixed(2));

  // Stock: purchase + capitalised costs in, cost of sale out.
  assert.equal(net(vouchers, 'S:VEHICLE_STOCK').toNumber(), 0);
  assert.equal(net(vouchers, 'S:VEHICLE_EXPENSE_CLEARING').toNumber(), -35000);

  // 2,00,000 received before the invoice is an advance moved to debtors on the sale date.
  assert.equal(byKey(vouchers, 'RECEIPT:p2').lines[1]?.accountId, 'S:CUSTOMER_ADVANCES');
  assert.equal(byKey(vouchers, 'RECEIPT:p3').lines[1]?.accountId, 'S:DEBTORS_CONTROL');
  assert.equal(net(vouchers, 'S:CUSTOMER_ADVANCES').toNumber(), 0);
  assert.equal(net(vouchers, 'S:DEBTORS_CONTROL').toNumber(), 0, 'fully paid');
  assert.equal(net(vouchers, 'S:CREDITORS_CONTROL').toNumber(), 0, 'seller fully paid');
  assert.equal(byKey(vouchers, 'RECEIPT:p2').lines[0]?.accountId, 'B:SELL_ACCOUNT_PAYMENT:UPI');
});

test('drafts and deleted records have no vouchers; unsold deals only have purchase side', () => {
  assert.deepEqual(buildSellAccountVouchers(deal({ isDraft: true }), ctx()), []);
  assert.deepEqual(buildSellAccountVouchers(deal({ deletedAt: new Date() }), ctx()), []);
  const unsold = buildSellAccountVouchers(deal({ invoiceGeneratedAt: null, dealStatus: 'RTO_WORK_IN_PROGRESS', payments: [] }), ctx());
  assert.deepEqual(unsold.map((voucher) => voucher.key).sort(), ['COSTS', 'PURCHASE']);
  const doneWithoutInvoice = buildSellAccountVouchers(deal({ invoiceGeneratedAt: null, completedAt: at('2026-10-15'), payments: [] }), ctx());
  assert.equal(byKey(doneWithoutInvoice, 'SALE').date.toISOString().slice(0, 10), '2026-10-15');
});

test('entries dated before the books begin are left to opening balances', () => {
  const vouchers = buildSellAccountVouchers(deal({ sellerDate: at('2026-03-20'), payments: [{ id: 'p0', side: 'SELLER_PAYMENT', amount: D(1000000), paymentDate: at('2026-03-21'), method: 'CASH', reference: null }] }), ctx());
  assert.equal(vouchers.some((voucher) => ['PURCHASE', 'COSTS', 'SELLER_PAYMENT:p0'].includes(voucher.key)), false);
  assert.ok(byKey(vouchers, 'SALE'));
});

test('own stock, exchanges and expensed costs', () => {
  const own = buildSellAccountVouchers(deal({ sourceType: 'JCB_EXCHANGE', payments: [] }), ctx({ sellerPartyId: null }));
  assert.equal(byKey(own, 'PURCHASE').lines[1]?.accountId, 'S:EXCHANGE_VEHICLE_STOCK');

  const exchanged = buildSellAccountVouchers(deal({ purchaseType: 'EXCHANGE', purchaseExchangeValue: D(300000), saleType: 'EXCHANGE', saleExchangeValue: D(400000), payments: [] }), ctx());
  assertBalanced(exchanged);
  assert.equal(net(exchanged, 'S:EXCHANGE_CLEARING').toNumber(), -300000);
  assert.equal(net(exchanged, 'S:EXCHANGE_VEHICLE_STOCK').toNumber(), 400000);
  assert.equal(net(exchanged, 'S:CREDITORS_CONTROL').toNumber(), -700000, 'seller is owed purchase minus the vehicle handed over');
  assert.equal(net(exchanged, 'S:DEBTORS_CONTROL').toNumber(), 800000, 'purchaser owes sale minus the vehicle taken in');

  const expensed = buildSellAccountVouchers(deal({ payments: [] }), ctx({ capitaliseCosts: false }));
  assert.deepEqual(byKey(expensed, 'COSTS').lines.filter((line) => line.debit.greaterThan(0)).map((line) => line.accountId), ['C:5201', 'C:5202', 'C:5203']);
  assert.equal(totals(byKey(expensed, 'COGS')).debit.toNumber(), 1000000);
});

test('voucherHash ignores narration but changes with amounts or dates', () => {
  const [purchase] = buildSellAccountVouchers(deal({ payments: [] }), ctx());
  assert.equal(voucherHash(purchase!), voucherHash({ ...purchase!, narration: 'edited' }));
  assert.notEqual(voucherHash(purchase!), voucherHash(buildSellAccountVouchers(deal({ purchaseAmount: D(999999), payments: [] }), ctx())[0]!));
  assert.notEqual(voucherHash(purchase!), voucherHash({ ...purchase!, date: at('2026-09-05') }));
});

test('listing payments, Prime, deposits and the API wallet', () => {
  const listing = buildListingPaymentVouchers({ id: 'l1', method: 'RAZORPAY', status: 'APPROVED', amount: D(50000), transactionRef: 'pay_1', reviewedAt: at('2026-10-02'), submittedAt: at('2026-10-01'), listingTitle: 'JCB 3DX' }, { accounts, buyerPartyId: 'buyer', booksBegin });
  assert.equal(listing[0]?.lines[0]?.accountId, 'B:LISTING_PAYMENT:RAZORPAY');
  assert.equal(listing[0]?.lines[1]?.accountId, 'S:CUSTOMER_ADVANCES');
  assert.deepEqual(buildListingPaymentVouchers({ id: 'l2', method: 'RTGS', status: 'REJECTED', amount: D(1), transactionRef: null, reviewedAt: null, submittedAt: at('2026-10-01'), listingTitle: null }, { accounts, buyerPartyId: 'buyer', booksBegin }), []);

  const split = splitInclusiveGst(D(999), 18, true);
  assert.equal(split.taxable.toFixed(2), '846.61');
  assert.equal(split.cgst.plus(split.sgst).plus(split.taxable).toFixed(2), '999.00');
  const prime = buildCustomerPrimeVouchers({ id: 'c1', status: 'ACTIVE', paidAmount: D(999), transactionRef: 'upi1', approvedAt: at('2026-10-03'), startedAt: null, submittedAt: at('2026-10-03'), customerState: 'Karnataka' }, { accounts, booksBegin, gstRatePercent: 18, companyState: 'Maharashtra' });
  assertBalanced(prime);
  assert.ok(prime[0]?.lines.some((line) => line.accountId === 'S:GST_OUTPUT_IGST'), 'inter-state → IGST');
  assert.deepEqual(buildCustomerPrimeVouchers({ id: 'c2', status: 'PENDING', paidAmount: D(999), transactionRef: null, approvedAt: null, startedAt: null, submittedAt: at('2026-10-03'), customerState: null }, { accounts, booksBegin, gstRatePercent: 18, companyState: 'Maharashtra' }), []);

  const deposit = { id: 'd1', depositType: 'BANK_TRANSFER', status: 'REFUNDED', amount: D(25000), referenceNo: 'R1', verifiedAt: at('2026-05-01'), paymentDate: null, createdAt: at('2026-05-01'), updatedAt: at('2026-10-01') };
  const deposits = buildPartnerDepositVouchers(deposit, { accounts, partnerPartyId: 'partner', booksBegin });
  assert.deepEqual(deposits.map((voucher) => voucher.key), ['RECEIPT', 'REFUND']);
  assertBalanced(deposits);
  assert.deepEqual(buildPartnerDepositVouchers({ ...deposit, depositType: 'BANK_GUARANTEE' }, { accounts, partnerPartyId: 'partner', booksBegin }), []);

  const recharge = buildWalletRechargeVouchers({ id: 'w1', type: 'CREDIT', amountPaise: 500000, externalTransactionId: 'tx1', createdAt: at('2026-10-04') }, { accounts, booksBegin });
  assert.equal(totals(recharge[0]!).debit.toFixed(2), '5000.00');
  assert.deepEqual(buildWalletRechargeVouchers({ id: 'w2', type: 'DEBIT', amountPaise: 500, externalTransactionId: null, createdAt: at('2026-10-04') }, { accounts, booksBegin }), []);
  const usage = buildWalletUsageVouchers(new Date('2026-10-04T00:00:00.000Z'), 1250, { accounts, booksBegin });
  assert.equal(usage[0]?.lines[0]?.accountId, 'S:API_EXPENSE');
  assert.equal(totals(usage[0]!).debit.toFixed(2), '12.50');
});

test('istDay uses the Indian calendar day', () => {
  assert.equal(istDay(new Date('2026-10-21T19:00:00.000Z')).toISOString().slice(0, 10), '2026-10-22');
  assert.equal(istDay(new Date('2026-10-21T18:00:00.000Z')).toISOString().slice(0, 10), '2026-10-21');
});

test('cash/bank lookup uses the mapping, then sensible defaults, then asks for a mapping', () => {
  const ledgers = [
    { id: 'cash', code: '1350', systemKey: 'CASH_IN_HAND', kind: 'CASH' as const, isActive: true },
    { id: 'rzp', code: '1291', systemKey: 'GATEWAY_RAZORPAY', kind: 'GATEWAY_CLEARING' as const, isActive: true },
    { id: 'hdfc', code: '1301', systemKey: null, kind: 'BANK' as const, isActive: true },
    { id: 'icici', code: '1302', systemKey: null, kind: 'BANK' as const, isActive: false },
    { id: 'rent', code: '6200', systemKey: null, kind: 'GENERAL' as const, isActive: true },
  ];
  const lookup = buildAccountLookup(ledgers, { SELL_ACCOUNT_PAYMENT: { UPI: 'hdfc', CHEQUE: 'rent' } });
  assert.equal(lookup.cashBank('SELL_ACCOUNT_PAYMENT', 'UPI'), 'hdfc');
  assert.equal(lookup.cashBank('SELL_ACCOUNT_PAYMENT', 'CASH'), 'cash');
  assert.equal(lookup.cashBank('LISTING_PAYMENT', 'RAZORPAY'), 'rzp');
  assert.equal(lookup.cashBank('SELL_ACCOUNT_PAYMENT', 'CHEQUE'), 'hdfc', 'a non-bank mapping is ignored; the only active bank is used');
  const twoBanks = buildAccountLookup([...ledgers, { id: 'sbi', code: '1303', systemKey: null, kind: 'BANK' as const, isActive: true }], {});
  assert.throws(() => twoBanks.cashBank('LISTING_PAYMENT', 'RTGS'), /Choose the bank\/cash account/);
  assert.throws(() => lookup.system('MISSING_KEY'), /Install the default chart/);
});

const terms = (overrides: Partial<DealTerms> = {}): DealTerms => ({
  dealMode: 'OUTRIGHT', consignorPartyId: null, consignmentCommission: null, brokerPartyId: null, brokeragePayable: D(0),
  brokerageReceivable: D(0), brokerageReceivablePartyId: null, partnerPartyId: null, partnerShareAmount: D(0), ...overrides,
});

test('consignment: no stock, the owner is owed the sale price less our commission', () => {
  const vouchers = buildSellAccountVouchers(deal(), ctx({ terms: terms({ dealMode: 'CONSIGNMENT', consignorPartyId: 'owner', consignmentCommission: D(118000) }), companyState: 'Maharashtra' }));
  assertBalanced(vouchers);
  assert.ok(!vouchers.some((voucher) => voucher.key === 'PURCHASE' || voucher.key === 'COGS'));
  assert.equal(net(vouchers, 'S:VEHICLE_STOCK').toNumber(), 0);
  assert.equal(net(vouchers, 'S:CONSIGNMENT_COMMISSION_INCOME').toNumber(), -100000);
  assert.equal(net(vouchers, 'S:GST_OUTPUT_CGST').toNumber(), -9000);
  assert.equal(net(vouchers, 'C:5201').toNumber(), 20000, 'costs are expensed, not capitalised');
  // 12,00,000 sale − 1,18,000 commission = 10,82,000 owed; 10,00,000 already paid to the owner.
  const owed = vouchers.flatMap((voucher) => voucher.lines).filter((line) => line.accountId === 'S:CONSIGNMENT_PAYABLE');
  assert.ok(owed.every((line) => line.partyId === 'owner'));
  assert.equal(net(vouchers, 'S:CONSIGNMENT_PAYABLE').toNumber(), -82000);
  assert.equal(net(vouchers, 'S:CREDITORS_CONTROL').toNumber(), 0);
});

test('consignment commission defaults to sale minus purchase and is IGST across states', () => {
  const vouchers = buildSellAccountVouchers(deal({ sellerState: 'Gujarat' }), ctx({ terms: terms({ dealMode: 'CONSIGNMENT' }), companyState: 'Maharashtra' }));
  assertBalanced(vouchers);
  const sale = byKey(vouchers, 'SALE');
  assert.equal(net([sale], 'S:CONSIGNMENT_PAYABLE').toNumber(), -1000000);
  assert.equal(net([sale], 'S:GST_OUTPUT_IGST').plus(net([sale], 'S:CONSIGNMENT_COMMISSION_INCOME')).toNumber(), -200000);
  assert.ok(net([sale], 'S:GST_OUTPUT_IGST').lessThan(0));
  assert.equal(sale.lines.find((line) => line.accountId === 'S:CONSIGNMENT_PAYABLE')?.partyId, 'seller', 'seller is the consignor by default');
});

test('brokerage payable, brokerage income and partner share are separate balanced vouchers', () => {
  const vouchers = buildSellAccountVouchers(deal(), ctx({
    terms: terms({ brokerPartyId: 'broker', brokeragePayable: D(15000), brokerageReceivable: D(11800), partnerPartyId: 'partner', partnerShareAmount: D(50000) }),
    companyState: 'Maharashtra',
  }));
  assertBalanced(vouchers);
  const payable = byKey(vouchers, 'BROKERAGE_PAYABLE');
  assert.equal(net([payable], 'S:BROKER_PAYABLES').toNumber(), -15000);
  assert.equal(payable.lines.find((line) => line.accountId === 'S:BROKER_PAYABLES')?.partyId, 'broker');
  const income = byKey(vouchers, 'BROKERAGE_INCOME');
  assert.equal(net([income], 'S:BROKERAGE_INCOME').toNumber(), -10000);
  assert.equal(income.lines[0]?.partyId, 'buyer', 'purchaser pays the brokerage by default');
  const share = byKey(vouchers, 'PARTNER_SHARE');
  assert.equal(share.date.toISOString().slice(0, 10), '2026-10-10');
  assert.equal(net([share], 'S:PARTNER_PAYABLES').toNumber(), -50000);

  const unsold = buildSellAccountVouchers(deal({ invoiceGeneratedAt: null, dealStatus: 'RTO_WORK_IN_PROGRESS', payments: [] }), ctx({ terms: terms({ partnerPartyId: 'partner', partnerShareAmount: D(50000) }) }));
  assert.ok(!unsold.some((voucher) => voucher.key === 'PARTNER_SHARE'), 'partner share waits for the sale');
});
