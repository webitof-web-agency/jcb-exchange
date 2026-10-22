import { FinVoucherStatus, Prisma } from '@prisma/client';
import prisma from '../../../lib/prisma';
import { calculateSellAccountGst, calculateSellAccountPaymentSummary } from '../../../services/sellAccountFinance';
import { notFound } from '../http';
import { purchaseDateOf, saleDateOf, vehicleCosts, type SellAccountSource } from '../posting/builders';
import { istToday } from '../utils/fy';
import { readDate } from '../utils/input';
import { LEDGER_STATUSES } from './ledgerRules';

// Vehicle finance, purchase and sales registers. Figures come from the Sold Vehicle records with
// the same functions the Sold Vehicles screen uses; book figures come from the ledger so the two
// can be compared side by side.

const DAY_MS = 24 * 60 * 60 * 1000;
const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const num = (value: Prisma.Decimal | number | null | undefined) => Number(value ?? 0);

const dealSelect = {
  id: true, recordNumber: true, listingId: true, listingTitle: true, vehicleNumber: true, chassisNumber: true, vehicleType: true, brandName: true, vehicleModel: true,
  sellerName: true, sellerNumber: true, sellerState: true, purchaserName: true, purchaserNumber: true, purchaserState: true,
  sourceType: true, purchaseType: true, saleType: true, purchaseAmount: true, sellAmount: true, purchaseExchangeValue: true, purchaseExchangeVehicle: true,
  saleExchangeValue: true, saleExchangeVehicle: true, brokerName: true, expenses: true, expenseBreakdown: true, marginBasis: true, netProfitAfterGst: true,
  isDraft: true, deletedAt: true, isLocked: true, dealStatus: true, rtoStatusSnapshot: true, invoiceNumber: true, invoiceGeneratedAt: true,
  completedAt: true, sellerDate: true, purchaserDate: true, sellDate: true, createdAt: true, updatedAt: true,
  payments: { select: { id: true, side: true, amount: true, paymentDate: true, method: true, reference: true, note: true }, orderBy: [{ paymentDate: 'asc' as const }, { createdAt: 'asc' as const }] },
} satisfies Prisma.SellAccountSelect;

type DealRecord = Prisma.SellAccountGetPayload<{ select: typeof dealSelect }>;

/** Source-side summary of one deal (pure). */
export const summarizeDeal = (deal: DealRecord, asOn: Date) => {
  const source = deal as unknown as SellAccountSource;
  const purchase = num(deal.purchaseAmount);
  const sale = num(deal.sellAmount);
  const costs = vehicleCosts(source).map((cost) => ({ head: cost.key, label: cost.label, amount: cost.amount.toNumber() }));
  const costTotal = round(costs.reduce((sum, cost) => sum + cost.amount, 0));
  const purchaseDate = purchase > 0 ? purchaseDateOf(source) : null;
  const saleDate = sale > 0 ? saleDateOf(source) : null;
  const gst = calculateSellAccountGst({ sellAmount: sale, purchaseAmount: purchase, expenses: num(deal.expenses), marginBasis: deal.marginBasis, sellerState: deal.sellerState ?? '', purchaserState: deal.purchaserState ?? '' });
  const exchange = {
    purchaseExchangeValue: deal.purchaseType === 'EXCHANGE' ? num(deal.purchaseExchangeValue) : 0,
    saleExchangeValue: deal.saleType === 'EXCHANGE' ? num(deal.saleExchangeValue) : 0,
  };
  const paid = calculateSellAccountPaymentSummary({
    sellAmount: sale,
    purchaseAmount: purchase,
    ...exchange,
    payments: deal.payments.map((payment) => ({ side: payment.side, amount: num(payment.amount) })),
  });
  const soldBy = saleDate && saleDate <= asOn ? saleDate : null;
  const inStock = Boolean(!deal.isDraft && purchaseDate && purchaseDate <= asOn && !soldBy);
  const stockEnd = soldBy ?? asOn;
  // Margin, GST and profit only exist once the sale is booked; an unsold vehicle has none yet.
  const booked = Boolean(saleDate);
  return {
    purchaseDate: purchaseDate?.toISOString().slice(0, 10) ?? null,
    saleDate: saleDate?.toISOString().slice(0, 10) ?? null,
    status: deal.isDraft ? 'DRAFT' : soldBy ? 'SOLD' : inStock ? 'IN_STOCK' : 'NOT_BOOKED',
    daysInStock: purchaseDate ? Math.max(Math.round((stockEnd.getTime() - purchaseDate.getTime()) / DAY_MS), 0) : null,
    purchase,
    costs,
    costTotal,
    landedCost: round(purchase + costTotal),
    sale,
    gstAmount: booked ? gst.gstAmount : 0,
    cgst: booked ? gst.cgst : 0,
    sgst: booked ? gst.sgst : 0,
    igst: booked ? gst.igst : 0,
    taxType: gst.stateClassification,
    saleExGst: booked ? round(sale - gst.gstAmount) : 0,
    margin: booked ? gst.marginAmount : 0,
    profit: booked ? gst.netProfitAfterGst : 0,
    profitPercent: booked && sale > 0 ? round((gst.netProfitAfterGst / sale) * 100) : null,
    ...exchange,
    sellerPaid: paid.sellerPaid,
    sellerBalance: paid.sellerBalance,
    sellerPaymentStatus: paid.sellerPaymentStatus,
    purchaserReceived: paid.purchaserReceived,
    purchaserBalance: paid.purchaserBalance,
    purchaserPaymentStatus: paid.purchaserPaymentStatus,
  };
};

export type DealSummary = ReturnType<typeof summarizeDeal>;

const ledgerStatuses = (includeDrafts: boolean): FinVoucherStatus[] => (includeDrafts ? [...LEDGER_STATUSES, 'DRAFT'] : LEDGER_STATUSES);

/** Per-vehicle book balances for the system ledgers that matter on vehicle screens. */
const bookFigures = async (vehicleIds: string[], includeDrafts: boolean) => {
  if (!vehicleIds.length) return new Map<string, Record<string, number>>();
  const [rows, accounts] = await Promise.all([
    prisma.finVoucherLine.groupBy({
      by: ['sellAccountId', 'accountId'],
      where: { sellAccountId: { in: vehicleIds }, voucher: { status: { in: ledgerStatuses(includeDrafts) } } },
      _sum: { debit: true, credit: true },
    }),
    prisma.finAccount.findMany({ select: { id: true, systemKey: true, group: { select: { nature: true } } } }),
  ]);
  const accountOf = new Map(accounts.map((account) => [account.id, account]));
  const result = new Map<string, Record<string, number>>();
  for (const row of rows) {
    if (!row.sellAccountId) continue;
    const account = accountOf.get(row.accountId);
    const net = num(row._sum.debit) - num(row._sum.credit);
    const entry = result.get(row.sellAccountId) ?? {};
    const key = account?.systemKey ?? 'OTHER';
    entry[key] = round((entry[key] ?? 0) + net);
    // Every income/expense line tagged to the vehicle: the vehicle's full deal result.
    if (account && (account.group.nature === 'INCOME' || account.group.nature === 'EXPENSE')) entry.__PNL = round((entry.__PNL ?? 0) - net);
    result.set(row.sellAccountId, entry);
  }
  return result;
};

const booksFor = (figures: Record<string, number> | undefined, sourceProfit: number) => {
  if (!figures) return { hasEntries: false, stock: 0, exchangeClearing: 0, exchangeStock: 0, costClearing: 0, salesIncome: 0, cogs: 0, profit: 0, dealProfit: 0, difference: null as number | null };
  const salesIncome = -(figures.VEHICLE_SALES_MARGIN ?? 0) - (figures.VEHICLE_SALES_REGULAR ?? 0);
  const cogs = figures.COGS_VEHICLES ?? 0;
  const profit = round(salesIncome - cogs);
  return {
    hasEntries: true,
    stock: figures.VEHICLE_STOCK ?? 0,
    exchangeClearing: figures.EXCHANGE_CLEARING ?? 0,
    exchangeStock: figures.EXCHANGE_VEHICLE_STOCK ?? 0,
    costClearing: figures.VEHICLE_EXPENSE_CLEARING ?? 0,
    salesIncome: round(salesIncome),
    cogs: round(cogs),
    profit,
    // Includes brokerage, partner share, consignment commission and costs booked on the vehicle.
    dealProfit: figures.__PNL ?? 0,
    difference: salesIncome || cogs ? round(profit - sourceProfit) : null,
  };
};

const dealLabel = (deal: Pick<DealRecord, 'recordNumber' | 'vehicleNumber' | 'listingTitle' | 'brandName' | 'vehicleModel'>) =>
  [deal.recordNumber, deal.vehicleNumber, deal.listingTitle || [deal.brandName, deal.vehicleModel].filter(Boolean).join(' ')].filter(Boolean).join(' · ');

export const getVehicleRegister = async (query: Record<string, unknown>) => {
  const asOn = readDate(query, 'asOn', 'As on date') ?? istToday();
  const from = readDate(query, 'from', 'From date');
  const to = readDate(query, 'to', 'To date');
  const q = typeof query.q === 'string' ? query.q.trim().slice(0, 60) : '';
  const status = typeof query.status === 'string' ? query.status : 'all';
  const dateBasis = query.dateBasis === 'sale' ? 'sale' : 'purchase';
  const includeDrafts = query.includeDrafts === 'true';
  const exchangeOnly = query.exchange === 'true';
  const invoicedOnly = query.invoiced === 'true';
  const page = Math.max(Number.parseInt(String(query.page || '1'), 10) || 1, 1);
  const pageSize = Math.min(Math.max(Number.parseInt(String(query.pageSize || '50'), 10) || 50, 1), 500);

  const deals = await prisma.sellAccount.findMany({
    where: {
      deletedAt: null,
      ...(typeof query.sourceType === 'string' && query.sourceType ? { sourceType: query.sourceType as never } : {}),
      ...(exchangeOnly ? { OR: [{ purchaseType: 'EXCHANGE' }, { saleType: 'EXCHANGE' }] } : {}),
      ...(invoicedOnly ? { invoiceNumber: { not: null } } : {}),
      ...(q
        ? {
            AND: [{
              OR: [
                { recordNumber: { contains: q, mode: 'insensitive' } },
                { vehicleNumber: { contains: q, mode: 'insensitive' } },
                { chassisNumber: { contains: q, mode: 'insensitive' } },
                { listingTitle: { contains: q, mode: 'insensitive' } },
                { brandName: { contains: q, mode: 'insensitive' } },
                { sellerName: { contains: q, mode: 'insensitive' } },
                { purchaserName: { contains: q, mode: 'insensitive' } },
                { invoiceNumber: { contains: q, mode: 'insensitive' } },
              ],
            }],
          }
        : {}),
    },
    select: dealSelect,
    orderBy: { createdAt: 'desc' },
    take: 5000,
  });

  const rows = deals
    .map((deal) => ({ deal, summary: summarizeDeal(deal, asOn) }))
    .filter(({ summary }) => {
      if (status === 'in_stock' && summary.status !== 'IN_STOCK') return false;
      if (status === 'sold' && summary.status !== 'SOLD') return false;
      if (status === 'booked' && summary.status === 'DRAFT') return false;
      const basisDate = dateBasis === 'sale' ? summary.saleDate : summary.purchaseDate;
      if ((from || to) && !basisDate) return false;
      if (from && basisDate! < from.toISOString().slice(0, 10)) return false;
      if (to && basisDate! > to.toISOString().slice(0, 10)) return false;
      return true;
    });

  const figures = await bookFigures(rows.map(({ deal }) => deal.id), includeDrafts);
  const all = rows.map(({ deal, summary }) => ({
    id: deal.id,
    label: dealLabel(deal),
    recordNumber: deal.recordNumber,
    listingId: deal.listingId,
    vehicleNumber: deal.vehicleNumber,
    chassisNumber: deal.chassisNumber,
    vehicleType: deal.vehicleType,
    brandName: deal.brandName,
    vehicleModel: deal.vehicleModel,
    listingTitle: deal.listingTitle,
    sellerName: deal.sellerName,
    sellerNumber: deal.sellerNumber,
    purchaserName: deal.purchaserName,
    purchaserNumber: deal.purchaserNumber,
    sourceType: deal.sourceType,
    purchaseType: deal.purchaseType,
    saleType: deal.saleType,
    purchaseExchangeVehicle: deal.purchaseExchangeVehicle,
    saleExchangeVehicle: deal.saleExchangeVehicle,
    dealStatus: deal.dealStatus,
    rtoStatus: deal.rtoStatusSnapshot,
    isLocked: deal.isLocked,
    invoiceNumber: deal.invoiceNumber,
    invoiceGeneratedAt: deal.invoiceGeneratedAt?.toISOString() ?? null,
    storedNetProfit: num(deal.netProfitAfterGst),
    ...summary,
    books: booksFor(figures.get(deal.id), summary.profit),
  }));

  const totals = all.reduce((sum, row) => ({
    count: sum.count + 1,
    purchase: round(sum.purchase + row.purchase),
    costTotal: round(sum.costTotal + row.costTotal),
    landedCost: round(sum.landedCost + row.landedCost),
    sale: round(sum.sale + (row.status === 'SOLD' ? row.sale : 0)),
    gstAmount: round(sum.gstAmount + (row.status === 'SOLD' ? row.gstAmount : 0)),
    profit: round(sum.profit + (row.status === 'SOLD' ? row.profit : 0)),
    stockValue: round(sum.stockValue + (row.status === 'IN_STOCK' ? row.landedCost : 0)),
    inStock: sum.inStock + (row.status === 'IN_STOCK' ? 1 : 0),
    sold: sum.sold + (row.status === 'SOLD' ? 1 : 0),
    sellerBalance: round(sum.sellerBalance + row.sellerBalance),
    purchaserBalance: round(sum.purchaserBalance + row.purchaserBalance),
  }), { count: 0, purchase: 0, costTotal: 0, landedCost: 0, sale: 0, gstAmount: 0, profit: 0, stockValue: 0, inStock: 0, sold: 0, sellerBalance: 0, purchaserBalance: 0 });

  return { asOn: asOn.toISOString().slice(0, 10), totals, total: all.length, page, pageSize, rows: all.slice((page - 1) * pageSize, page * pageSize) };
};

export const getVehicleDetail = async (id: string, query: Record<string, unknown>) => {
  const includeDrafts = query.includeDrafts === 'true';
  const deal = await prisma.sellAccount.findUnique({ where: { id }, select: dealSelect });
  if (!deal) throw notFound('Sold Vehicle record not found.');
  const summary = summarizeDeal(deal, istToday());
  const [lines, figures, vouchers] = await Promise.all([
    prisma.finVoucherLine.findMany({
      where: { sellAccountId: id, voucher: { status: { in: ledgerStatuses(includeDrafts) } } },
      include: {
        account: { select: { code: true, name: true, systemKey: true } },
        party: { select: { name: true } },
        voucher: { select: { id: true, number: true, type: true, date: true, status: true, narration: true, sourceEvent: true } },
      },
      orderBy: [{ voucher: { date: 'asc' } }, { voucher: { createdAt: 'asc' } }, { lineNo: 'asc' }],
    }),
    bookFigures([id], includeDrafts),
    prisma.finVoucher.findMany({
      where: { sourceType: 'SELL_ACCOUNT', sourceId: id, reversalOfId: null, status: { in: ['DRAFT', 'POSTED'] } },
      select: { id: true, number: true, status: true, sourceEvent: true },
    }),
  ]);
  const voucherFor = (key: string) => vouchers.find((voucher) => voucher.sourceEvent === key) ?? null;
  const byAccount = new Map<string, { code: string; name: string; debit: number; credit: number }>();
  for (const line of lines) {
    const entry = byAccount.get(line.accountId) ?? { code: line.account.code, name: line.account.name, debit: 0, credit: 0 };
    entry.debit = round(entry.debit + num(line.debit));
    entry.credit = round(entry.credit + num(line.credit));
    byAccount.set(line.accountId, entry);
  }
  return {
    vehicle: {
      id: deal.id,
      label: dealLabel(deal),
      recordNumber: deal.recordNumber,
      vehicleNumber: deal.vehicleNumber,
      chassisNumber: deal.chassisNumber,
      vehicleType: deal.vehicleType,
      brandName: deal.brandName,
      vehicleModel: deal.vehicleModel,
      sellerName: deal.sellerName,
      purchaserName: deal.purchaserName,
      sourceType: deal.sourceType,
      purchaseType: deal.purchaseType,
      saleType: deal.saleType,
      purchaseExchangeVehicle: deal.purchaseExchangeVehicle,
      saleExchangeVehicle: deal.saleExchangeVehicle,
      brokerName: deal.brokerName,
      dealStatus: deal.dealStatus,
      rtoStatus: deal.rtoStatusSnapshot,
      isLocked: deal.isLocked,
      isDraft: deal.isDraft,
      invoiceNumber: deal.invoiceNumber,
      storedNetProfit: num(deal.netProfitAfterGst),
    },
    summary,
    books: booksFor(figures.get(id), summary.profit),
    postings: {
      purchase: voucherFor('PURCHASE'),
      costs: voucherFor('COSTS'),
      sale: voucherFor('SALE'),
      cogs: voucherFor('COGS'),
    },
    payments: deal.payments.map((payment) => {
      const voucher = voucherFor(`${payment.side === 'SELLER_PAYMENT' ? 'SELLER_PAYMENT' : 'RECEIPT'}:${payment.id}`);
      return { ...payment, amount: num(payment.amount), paymentDate: payment.paymentDate.toISOString().slice(0, 10), voucher };
    }),
    ledger: lines.map((line) => ({
      id: line.id,
      date: line.voucher.date.toISOString().slice(0, 10),
      voucherId: line.voucher.id,
      voucherNumber: line.voucher.number,
      voucherType: line.voucher.type,
      status: line.voucher.status,
      narration: line.narration || line.voucher.narration,
      account: `${line.account.code} · ${line.account.name}`,
      party: line.party?.name ?? null,
      debit: num(line.debit),
      credit: num(line.credit),
    })),
    accountTotals: Array.from(byAccount.values()).sort((a, b) => a.code.localeCompare(b.code)),
    includeDrafts,
  };
};

/** Open balances on one system ledger by party and vehicle (seller/customer advances, clearing). */
export const getLedgerBalances = async (query: Record<string, unknown>) => {
  const systemKey = typeof query.systemKey === 'string' ? query.systemKey : '';
  const account = await prisma.finAccount.findUnique({ where: { systemKey }, select: { id: true, code: true, name: true, normalBalance: true } });
  if (!account) throw notFound('Ledger not found. Install the default chart of accounts.');
  const includeDrafts = query.includeDrafts === 'true';
  const rows = await prisma.finVoucherLine.groupBy({
    by: ['partyId', 'sellAccountId'],
    where: { accountId: account.id, voucher: { status: { in: ledgerStatuses(includeDrafts) } } },
    _sum: { debit: true, credit: true },
    _min: { createdAt: true },
    _count: { _all: true },
  });
  const open = rows.map((row) => ({ ...row, net: round(num(row._sum.debit) - num(row._sum.credit)) })).filter((row) => row.net !== 0);
  const [parties, vehicles] = await Promise.all([
    prisma.finParty.findMany({ where: { id: { in: open.flatMap((row) => (row.partyId ? [row.partyId] : [])) } }, select: { id: true, code: true, name: true, mobile: true } }),
    prisma.sellAccount.findMany({ where: { id: { in: open.flatMap((row) => (row.sellAccountId ? [row.sellAccountId] : [])) } }, select: { id: true, recordNumber: true, vehicleNumber: true, listingTitle: true, brandName: true, vehicleModel: true } }),
  ]);
  const today = istToday().getTime();
  const balances = open.map((row) => {
    const party = parties.find((item) => item.id === row.partyId);
    const vehicle = vehicles.find((item) => item.id === row.sellAccountId);
    return {
      partyId: row.partyId,
      partyName: party ? `${party.code} · ${party.name}` : null,
      partyMobile: party?.mobile ?? null,
      sellAccountId: row.sellAccountId,
      vehicle: vehicle ? dealLabel(vehicle) : row.sellAccountId ? 'Deleted Sold Vehicle' : null,
      entries: row._count._all,
      balance: row.net,
      ageDays: row._min.createdAt ? Math.max(Math.round((today - row._min.createdAt.getTime()) / DAY_MS), 0) : null,
    };
  }).sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));
  return { account, includeDrafts, balances, total: round(balances.reduce((sum, row) => sum + row.balance, 0)) };
};

/** Every receipt the business took in, from all sources, with its posting status. */
export const getReceiptsRegister = async (query: Record<string, unknown>) => {
  const from = readDate(query, 'from', 'From date');
  const to = readDate(query, 'to', 'To date');
  const dateFilter = from || to ? { ...(from ? { gte: from } : {}), ...(to ? { lt: new Date(to.getTime() + DAY_MS) } : {}) } : undefined;
  const source = typeof query.source === 'string' ? query.source : '';
  const q = typeof query.q === 'string' ? query.q.trim().toLowerCase().slice(0, 60) : '';

  const [dealPayments, listingPayments, prime] = await Promise.all([
    !source || source === 'SELL_ACCOUNT'
      ? prisma.sellAccountPayment.findMany({
          where: { side: 'PURCHASER_RECEIPT', ...(dateFilter ? { paymentDate: dateFilter } : {}), sellAccount: { deletedAt: null } },
          include: { sellAccount: { select: { id: true, recordNumber: true, vehicleNumber: true, listingTitle: true, brandName: true, vehicleModel: true, purchaserName: true, purchaserNumber: true } } },
          take: 5000,
        })
      : Promise.resolve([]),
    !source || source === 'LISTING_PAYMENT'
      ? prisma.listingPaymentSubmission.findMany({
          where: { status: { in: ['APPROVED', 'PAID'] }, ...(dateFilter ? { submittedAt: dateFilter } : {}) },
          include: { buyer: { select: { name: true, mobile: true } }, listing: { select: { title: true } } },
          take: 5000,
        })
      : Promise.resolve([]),
    !source || source === 'CUSTOMER_PRIME'
      ? prisma.customerPrimeSubscription.findMany({
          where: { status: { in: ['ACTIVE', 'EXPIRED'] }, ...(dateFilter ? { submittedAt: dateFilter } : {}) },
          include: { user: { select: { name: true, mobile: true } } },
          take: 5000,
        })
      : Promise.resolve([]),
  ]);

  const rows = [
    ...dealPayments.map((payment) => ({
      key: `SELL_ACCOUNT:${payment.sellAccountId}:RECEIPT:${payment.id}`,
      source: 'SELL_ACCOUNT', sourceId: payment.sellAccountId, sourceEvent: `RECEIPT:${payment.id}`,
      date: payment.paymentDate.toISOString().slice(0, 10), party: payment.sellAccount.purchaserName, mobile: payment.sellAccount.purchaserNumber,
      against: dealLabel(payment.sellAccount), method: payment.method, reference: payment.reference, amount: num(payment.amount),
    })),
    ...listingPayments.map((payment) => ({
      key: `LISTING_PAYMENT:${payment.id}:RECEIPT`,
      source: 'LISTING_PAYMENT', sourceId: payment.id, sourceEvent: 'RECEIPT',
      date: (payment.reviewedAt ?? payment.submittedAt).toISOString().slice(0, 10), party: payment.buyer.name, mobile: payment.buyer.mobile,
      against: payment.listing?.title ?? 'Listing payment', method: payment.method, reference: payment.transactionRef, amount: num(payment.amount),
    })),
    ...prime.map((subscription) => ({
      key: `CUSTOMER_PRIME:${subscription.id}:RECEIPT`,
      source: 'CUSTOMER_PRIME', sourceId: subscription.id, sourceEvent: 'RECEIPT',
      date: (subscription.approvedAt ?? subscription.submittedAt).toISOString().slice(0, 10), party: subscription.user.name, mobile: subscription.user.mobile,
      against: 'Customer Prime subscription', method: 'UPI', reference: subscription.transactionRef, amount: num(subscription.paidAmount),
    })),
  ].filter((row) => !q || [row.party, row.mobile, row.against, row.reference].some((value) => value?.toLowerCase().includes(q)));

  const vouchers = rows.length
    ? await prisma.finVoucher.findMany({
        where: { sourceType: { in: ['SELL_ACCOUNT', 'LISTING_PAYMENT', 'CUSTOMER_PRIME'] }, sourceId: { in: Array.from(new Set(rows.map((row) => row.sourceId))) }, reversalOfId: null, status: { in: ['DRAFT', 'POSTED'] } },
        select: { id: true, number: true, status: true, sourceType: true, sourceId: true, sourceEvent: true },
      })
    : [];
  const withVoucher = rows
    .map((row) => ({ ...row, voucher: vouchers.find((voucher) => voucher.sourceType === row.source && voucher.sourceId === row.sourceId && voucher.sourceEvent === row.sourceEvent) ?? null }))
    .sort((a, b) => b.date.localeCompare(a.date));
  const page = Math.max(Number.parseInt(String(query.page || '1'), 10) || 1, 1);
  const pageSize = Math.min(Math.max(Number.parseInt(String(query.pageSize || '50'), 10) || 50, 1), 500);
  const bySource = withVoucher.reduce<Record<string, { count: number; amount: number }>>((sum, row) => {
    const entry = sum[row.source] ?? { count: 0, amount: 0 };
    sum[row.source] = { count: entry.count + 1, amount: round(entry.amount + row.amount) };
    return sum;
  }, {});
  return {
    total: withVoucher.length,
    amount: round(withVoucher.reduce((sum, row) => sum + row.amount, 0)),
    unposted: withVoucher.filter((row) => !row.voucher || row.voucher.status !== 'POSTED').length,
    bySource,
    page,
    pageSize,
    rows: withVoucher.slice((page - 1) * pageSize, page * pageSize),
  };
};
