import { createHash } from 'node:crypto';
import { FinVoucherType, Prisma } from '@prisma/client';
import { calculateSellAccountGst, normalizeSellAccountExpenseBreakdown } from '../../../services/sellAccountFinance';
import { roundMoney, sumMoney } from '../utils/money';

// Pure translators: one source record → the vouchers it should have in the books
// (docs/finance-hub/01_DATA_MODEL_AND_POSTING.md §4). Nothing here reads or writes the database.

const ZERO = new Prisma.Decimal(0);
const D = (value: Prisma.Decimal | number | string | null | undefined) => roundMoney(new Prisma.Decimal(value ?? 0));

export type DesiredLine = {
  accountId: string;
  partyId?: string | null;
  sellAccountId?: string | null;
  debit: Prisma.Decimal;
  credit: Prisma.Decimal;
  narration?: string | null;
};

export type DesiredVoucher = {
  key: string;
  type: FinVoucherType;
  date: Date;
  narration: string;
  reference?: string | null;
  paymentMethod?: string | null;
  partyId?: string | null;
  sellAccountId?: string | null;
  lines: DesiredLine[];
};

/** Hash of the financial content only, so editing a narration never reverses a voucher. */
export const voucherHash = (voucher: DesiredVoucher) => createHash('sha256').update(JSON.stringify({
  type: voucher.type,
  date: voucher.date.toISOString().slice(0, 10),
  lines: voucher.lines
    .map((line) => [line.accountId, line.partyId ?? '', line.sellAccountId ?? '', D(line.debit).toFixed(2), D(line.credit).toFixed(2)].join('|'))
    .sort(),
})).digest('hex');

export class PostingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PostingError';
  }
}

export type AccountLookup = {
  /** Ledger id by system key (seeded chart). Throws when the chart is incomplete. */
  system: (key: string) => string;
  /** Ledger id by code, for heads without a system key (direct vehicle cost ledgers). */
  code: (code: string) => string;
  /** Bank / cash / gateway ledger for a payment method of a source. */
  cashBank: (source: string, method: string) => string;
};

const debit = (accountId: string, amount: Prisma.Decimal, extra: Partial<DesiredLine> = {}): DesiredLine => ({ accountId, debit: D(amount), credit: ZERO, ...extra });
const credit = (accountId: string, amount: Prisma.Decimal, extra: Partial<DesiredLine> = {}): DesiredLine => ({ accountId, debit: ZERO, credit: D(amount), ...extra });

const withinBooks = (date: Date | null, booksBegin: Date) => Boolean(date && date >= booksBegin);
const dayOf = (date: Date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
const IST_MS = 330 * 60 * 1000;
/** Calendar day in India for a timestamp (vouchers are dated in IST). */
export const istDay = (timestamp: Date) => dayOf(new Date(timestamp.getTime() + IST_MS));

// ---------------------------------------------------------------------------
// Sold Vehicle (SellAccount) with its payments — rules R1–R6
// ---------------------------------------------------------------------------

export type SellAccountSource = {
  id: string;
  recordNumber: string;
  vehicleNumber: string | null;
  listingTitle: string | null;
  sourceType: string | null;
  purchaseType: string;
  saleType: string;
  purchaseAmount: Prisma.Decimal;
  sellAmount: Prisma.Decimal;
  purchaseExchangeValue: Prisma.Decimal;
  saleExchangeValue: Prisma.Decimal;
  expenses: Prisma.Decimal;
  expenseBreakdown: unknown;
  sellerState: string | null;
  purchaserState: string | null;
  isDraft: boolean;
  deletedAt: Date | null;
  dealStatus: string;
  invoiceNumber: string | null;
  invoiceGeneratedAt: Date | null;
  completedAt: Date | null;
  sellerDate: Date | null;
  purchaserDate: Date | null;
  sellDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
  payments: Array<{ id: string; side: string; amount: Prisma.Decimal; paymentDate: Date; method: string; reference: string | null }>;
};

/** Purchase is booked when the record is saved (not a draft); dated by the seller date. */
export const purchaseDateOf = (deal: SellAccountSource) => istDay(deal.sellerDate ?? deal.sellDate ?? deal.createdAt);

/** Sale is booked when the invoice is generated, or when the deal is marked done. */
export const saleDateOf = (deal: SellAccountSource) => {
  if (deal.invoiceGeneratedAt) return istDay(deal.invoiceGeneratedAt);
  if (deal.dealStatus === 'DEAL_DONE') return istDay(deal.completedAt ?? deal.purchaserDate ?? deal.sellDate ?? deal.updatedAt);
  return null;
};

const COST_HEADS = [
  { key: 'transport', label: 'Transport', code: '5201' },
  { key: 'paperwork', label: 'Paperwork', code: '5202' },
  { key: 'rtoWork', label: 'RTO work', code: '5203' },
  { key: 'other', label: 'Other', code: '5209' },
] as const;

export const vehicleCosts = (deal: Pick<SellAccountSource, 'expenseBreakdown' | 'expenses'>) => {
  const breakdown = normalizeSellAccountExpenseBreakdown(deal.expenseBreakdown);
  if (!breakdown) {
    const total = D(deal.expenses);
    return total.greaterThan(0) ? [{ ...COST_HEADS[3], label: 'Expenses', amount: total }] : [];
  }
  return COST_HEADS
    .map((head) => ({ ...head, label: head.key === 'other' && breakdown.otherLabel ? breakdown.otherLabel : head.label, amount: D(breakdown[head.key]) }))
    .filter((head) => head.amount.greaterThan(0));
};

export const buildSellAccountVouchers = (
  deal: SellAccountSource,
  context: { accounts: AccountLookup; sellerPartyId: string | null; purchaserPartyId: string | null; booksBegin: Date; capitaliseCosts: boolean },
): DesiredVoucher[] => {
  if (deal.isDraft || deal.deletedAt) return [];
  const { accounts, booksBegin } = context;
  const V = deal.id;
  const label = [deal.recordNumber, deal.vehicleNumber, deal.listingTitle].filter(Boolean).join(' · ');
  const vouchers: DesiredVoucher[] = [];
  const purchaseAmount = D(deal.purchaseAmount);
  const sellAmount = D(deal.sellAmount);
  const purchaseDate = purchaseAmount.greaterThan(0) ? purchaseDateOf(deal) : null;
  const saleDate = sellAmount.greaterThan(0) ? saleDateOf(deal) : null;
  const ownStock = deal.sourceType === 'JCB_EXCHANGE';
  const Ps = context.sellerPartyId;
  const Pc = context.purchaserPartyId;
  const costs = vehicleCosts(deal);
  const costTotal = sumMoney(costs.map((cost) => cost.amount));

  // R1 purchase
  if (purchaseDate && withinBooks(purchaseDate, booksBegin)) {
    if (!ownStock && !Ps) throw new PostingError(`${deal.recordNumber}: seller party could not be resolved.`);
    vouchers.push({
      key: 'PURCHASE',
      type: 'PURCHASE',
      date: purchaseDate,
      narration: `Vehicle purchase ${label}`,
      reference: deal.recordNumber,
      partyId: ownStock ? null : Ps,
      sellAccountId: V,
      lines: [
        debit(accounts.system('VEHICLE_STOCK'), purchaseAmount, { sellAccountId: V }),
        ownStock
          ? credit(accounts.system('EXCHANGE_VEHICLE_STOCK'), purchaseAmount, { sellAccountId: V, narration: 'Taken from exchange stock' })
          : credit(accounts.system('CREDITORS_CONTROL'), purchaseAmount, { partyId: Ps, sellAccountId: V }),
      ],
    });

    // R1x vehicle handed over to the seller as part of the price
    const handedOver = deal.purchaseType === 'EXCHANGE' ? D(deal.purchaseExchangeValue) : ZERO;
    if (handedOver.greaterThan(0) && !ownStock) {
      vouchers.push({
        key: 'PURCHASE_EXCHANGE',
        type: 'JOURNAL',
        date: purchaseDate,
        narration: `Exchange vehicle handed to seller against ${label}`,
        reference: deal.recordNumber,
        partyId: Ps,
        sellAccountId: V,
        lines: [
          debit(accounts.system('CREDITORS_CONTROL'), handedOver, { partyId: Ps, sellAccountId: V }),
          credit(accounts.system('EXCHANGE_CLEARING'), handedOver, { sellAccountId: V }),
        ],
      });
    }

    // R2 vehicle costs from the Sold Vehicle form
    if (costTotal.greaterThan(0)) {
      vouchers.push({
        key: 'COSTS',
        type: 'JOURNAL',
        date: purchaseDate,
        narration: `Vehicle costs ${label}`,
        reference: deal.recordNumber,
        sellAccountId: V,
        lines: [
          ...costs.map((cost) => debit(context.capitaliseCosts ? accounts.system('VEHICLE_STOCK') : accounts.code(cost.code), cost.amount, { sellAccountId: V, narration: cost.label })),
          credit(accounts.system('VEHICLE_EXPENSE_CLEARING'), costTotal, { sellAccountId: V }),
        ],
      });
    }
  }

  // R3 sale (margin scheme, GST from the existing Sold Vehicles calculation) + R3c COGS + R3x
  if (saleDate && withinBooks(saleDate, booksBegin)) {
    if (!Pc) throw new PostingError(`${deal.recordNumber}: purchaser party could not be resolved.`);
    const gst = calculateSellAccountGst({
      sellAmount: sellAmount.toNumber(),
      purchaseAmount: purchaseAmount.toNumber(),
      expenses: D(deal.expenses).toNumber(),
      sellerState: deal.sellerState ?? '',
      purchaserState: deal.purchaserState ?? '',
    });
    const cgst = D(gst.cgst);
    const sgst = D(gst.sgst);
    const igst = D(gst.igst);
    const taxLines = [
      ['GST_OUTPUT_CGST', cgst],
      ['GST_OUTPUT_SGST', sgst],
      ['GST_OUTPUT_IGST', igst],
    ].filter(([, amount]) => (amount as Prisma.Decimal).greaterThan(0)) as Array<[string, Prisma.Decimal]>;
    const tax = sumMoney(taxLines.map(([, amount]) => amount));
    vouchers.push({
      key: 'SALE',
      type: 'SALES',
      date: saleDate,
      narration: `Vehicle sale ${label}${deal.invoiceNumber ? ` (invoice ${deal.invoiceNumber})` : ''}`,
      reference: deal.invoiceNumber ?? deal.recordNumber,
      partyId: Pc,
      sellAccountId: V,
      lines: [
        debit(accounts.system('DEBTORS_CONTROL'), sellAmount, { partyId: Pc, sellAccountId: V }),
        credit(accounts.system('VEHICLE_SALES_MARGIN'), sellAmount.minus(tax), { sellAccountId: V }),
        ...taxLines.map(([key, amount]) => credit(accounts.system(key), amount, { sellAccountId: V, narration: 'GST on margin' })),
      ],
    });

    const cost = purchaseAmount.plus(context.capitaliseCosts ? costTotal : ZERO);
    if (cost.greaterThan(0)) {
      vouchers.push({
        key: 'COGS',
        type: 'JOURNAL',
        date: saleDate,
        narration: `Cost of vehicle sold ${label}`,
        reference: deal.recordNumber,
        sellAccountId: V,
        lines: [
          debit(accounts.system('COGS_VEHICLES'), cost, { sellAccountId: V }),
          credit(accounts.system('VEHICLE_STOCK'), cost, { sellAccountId: V }),
        ],
      });
    }

    const takenIn = deal.saleType === 'EXCHANGE' ? D(deal.saleExchangeValue) : ZERO;
    if (takenIn.greaterThan(0)) {
      vouchers.push({
        key: 'SALE_EXCHANGE',
        type: 'JOURNAL',
        date: saleDate,
        narration: `Vehicle taken in exchange from purchaser against ${label}`,
        reference: deal.recordNumber,
        partyId: Pc,
        sellAccountId: V,
        lines: [
          debit(accounts.system('EXCHANGE_VEHICLE_STOCK'), takenIn, { sellAccountId: V }),
          credit(accounts.system('DEBTORS_CONTROL'), takenIn, { partyId: Pc, sellAccountId: V }),
        ],
      });
    }
  }

  // R4/R5 payments. Money before the sale/purchase is booked sits in advances; one transfer
  // journal on the booking date moves it, so earlier receipts never need to be reversed.
  let advanceReceived = ZERO;
  let advancePaid = ZERO;
  for (const payment of deal.payments) {
    const amount = D(payment.amount);
    const date = istDay(payment.paymentDate);
    if (!amount.greaterThan(0) || !withinBooks(date, booksBegin)) continue;
    if (payment.side === 'PURCHASER_RECEIPT') {
      if (!Pc) throw new PostingError(`${deal.recordNumber}: purchaser party could not be resolved.`);
      const isAdvance = !saleDate || date < saleDate;
      if (isAdvance && saleDate && withinBooks(saleDate, booksBegin)) advanceReceived = advanceReceived.plus(amount);
      vouchers.push({
        key: `RECEIPT:${payment.id}`,
        type: 'RECEIPT',
        date,
        narration: `Received from purchaser for ${label}`,
        reference: payment.reference,
        paymentMethod: payment.method,
        partyId: Pc,
        sellAccountId: V,
        lines: [
          debit(accounts.cashBank('SELL_ACCOUNT_PAYMENT', payment.method), amount),
          credit(accounts.system(isAdvance ? 'CUSTOMER_ADVANCES' : 'DEBTORS_CONTROL'), amount, { partyId: Pc, sellAccountId: V }),
        ],
      });
    } else if (payment.side === 'SELLER_PAYMENT') {
      if (!Ps) throw new PostingError(`${deal.recordNumber}: seller party could not be resolved.`);
      const isAdvance = ownStock || !purchaseDate || date < purchaseDate;
      if (isAdvance && !ownStock && purchaseDate && withinBooks(purchaseDate, booksBegin)) advancePaid = advancePaid.plus(amount);
      vouchers.push({
        key: `SELLER_PAYMENT:${payment.id}`,
        type: 'PAYMENT',
        date,
        narration: `Paid to seller for ${label}`,
        reference: payment.reference,
        paymentMethod: payment.method,
        partyId: Ps,
        sellAccountId: V,
        lines: [
          debit(accounts.system(isAdvance ? 'SELLER_ADVANCES' : 'CREDITORS_CONTROL'), amount, { partyId: Ps, sellAccountId: V }),
          credit(accounts.cashBank('SELL_ACCOUNT_PAYMENT', payment.method), amount),
        ],
      });
    }
  }

  if (advanceReceived.greaterThan(0) && saleDate) {
    vouchers.push({
      key: 'ADVANCE_ADJUST',
      type: 'JOURNAL',
      date: saleDate,
      narration: `Purchaser advances adjusted against sale ${label}`,
      reference: deal.recordNumber,
      partyId: Pc,
      sellAccountId: V,
      lines: [
        debit(accounts.system('CUSTOMER_ADVANCES'), advanceReceived, { partyId: Pc, sellAccountId: V }),
        credit(accounts.system('DEBTORS_CONTROL'), advanceReceived, { partyId: Pc, sellAccountId: V }),
      ],
    });
  }
  if (advancePaid.greaterThan(0) && purchaseDate) {
    vouchers.push({
      key: 'SELLER_ADVANCE_ADJUST',
      type: 'JOURNAL',
      date: purchaseDate,
      narration: `Seller advances adjusted against purchase ${label}`,
      reference: deal.recordNumber,
      partyId: Ps,
      sellAccountId: V,
      lines: [
        debit(accounts.system('CREDITORS_CONTROL'), advancePaid, { partyId: Ps, sellAccountId: V }),
        credit(accounts.system('SELLER_ADVANCES'), advancePaid, { partyId: Ps, sellAccountId: V }),
      ],
    });
  }

  return vouchers;
};

// ---------------------------------------------------------------------------
// Listing payments (R10), Customer Prime (R12), partner deposits (R13), API wallet (R14/R15)
// ---------------------------------------------------------------------------

export const buildListingPaymentVouchers = (
  payment: { id: string; method: string; status: string; amount: Prisma.Decimal; transactionRef: string | null; reviewedAt: Date | null; submittedAt: Date; listingTitle: string | null },
  context: { accounts: AccountLookup; buyerPartyId: string | null; booksBegin: Date },
): DesiredVoucher[] => {
  if (!['APPROVED', 'PAID'].includes(payment.status)) return [];
  const amount = D(payment.amount);
  const date = istDay(payment.reviewedAt ?? payment.submittedAt);
  if (!amount.greaterThan(0) || !withinBooks(date, context.booksBegin)) return [];
  if (!context.buyerPartyId) throw new PostingError('Listing payment buyer could not be resolved.');
  return [{
    key: 'RECEIPT',
    type: 'RECEIPT',
    date,
    narration: `Listing payment received${payment.listingTitle ? ` for ${payment.listingTitle}` : ''}`,
    reference: payment.transactionRef,
    paymentMethod: payment.method,
    partyId: context.buyerPartyId,
    lines: [
      debit(context.accounts.cashBank('LISTING_PAYMENT', payment.method), amount),
      credit(context.accounts.system('CUSTOMER_ADVANCES'), amount, { partyId: context.buyerPartyId }),
    ],
  }];
};

/** GST-inclusive split, same as the Customer Prime invoice (utils/customerPrimeInvoice.ts). */
export const splitInclusiveGst = (total: Prisma.Decimal, ratePercent: number, intraState: boolean) => {
  const taxable = roundMoney(total.dividedBy(1 + ratePercent / 100));
  const tax = roundMoney(total.minus(taxable));
  const cgst = intraState ? roundMoney(tax.dividedBy(2)) : ZERO;
  const sgst = intraState ? roundMoney(tax.minus(cgst)) : ZERO;
  return { taxable, cgst, sgst, igst: intraState ? ZERO : tax };
};

export const buildCustomerPrimeVouchers = (
  subscription: { id: string; status: string; paidAmount: Prisma.Decimal; transactionRef: string | null; approvedAt: Date | null; startedAt: Date | null; submittedAt: Date; customerState: string | null },
  context: { accounts: AccountLookup; booksBegin: Date; gstRatePercent: number; companyState: string | null },
): DesiredVoucher[] => {
  if (!['ACTIVE', 'EXPIRED'].includes(subscription.status)) return [];
  const amount = D(subscription.paidAmount);
  const date = istDay(subscription.approvedAt ?? subscription.startedAt ?? subscription.submittedAt);
  if (!amount.greaterThan(0) || !withinBooks(date, context.booksBegin)) return [];
  const supplier = (context.companyState || 'Maharashtra').trim().toLowerCase();
  const customer = (subscription.customerState || '').trim().toLowerCase();
  const split = splitInclusiveGst(amount, context.gstRatePercent, !customer || customer === supplier);
  const { accounts } = context;
  return [{
    key: 'RECEIPT',
    type: 'RECEIPT',
    date,
    narration: 'Customer Prime subscription received',
    reference: subscription.transactionRef,
    paymentMethod: 'UPI',
    lines: [
      debit(accounts.cashBank('CUSTOMER_PRIME', 'UPI'), amount),
      credit(accounts.system('SUBSCRIPTION_INCOME'), split.taxable),
      ...([['GST_OUTPUT_CGST', split.cgst], ['GST_OUTPUT_SGST', split.sgst], ['GST_OUTPUT_IGST', split.igst]] as Array<[string, Prisma.Decimal]>)
        .filter(([, value]) => value.greaterThan(0))
        .map(([key, value]) => credit(accounts.system(key), value)),
    ],
  }];
};

export const CASH_DEPOSIT_TYPES = ['ONLINE_PAYMENT', 'UPI_PAYMENT', 'NET_BANKING', 'BANK_TRANSFER', 'CASH', 'CHEQUE', 'DEMAND_DRAFT'];

export const buildPartnerDepositVouchers = (
  deposit: { id: string; depositType: string; status: string; amount: Prisma.Decimal | null; referenceNo: string | null; verifiedAt: Date | null; paymentDate: Date | null; createdAt: Date; updatedAt: Date },
  context: { accounts: AccountLookup; partnerPartyId: string | null; booksBegin: Date },
): DesiredVoucher[] => {
  // Bank guarantees, waivers and undertakings move no money.
  if (!CASH_DEPOSIT_TYPES.includes(deposit.depositType)) return [];
  if (!['VERIFIED', 'REFUND_REQUESTED', 'REFUNDED'].includes(deposit.status)) return [];
  const amount = D(deposit.amount);
  if (!amount.greaterThan(0)) return [];
  if (!context.partnerPartyId) throw new PostingError('Partner for the deposit could not be resolved.');
  const { accounts } = context;
  const vouchers: DesiredVoucher[] = [];
  const receivedOn = istDay(deposit.verifiedAt ?? deposit.paymentDate ?? deposit.createdAt);
  if (withinBooks(receivedOn, context.booksBegin)) {
    vouchers.push({
      key: 'RECEIPT',
      type: 'RECEIPT',
      date: receivedOn,
      narration: 'Partner security deposit received',
      reference: deposit.referenceNo,
      paymentMethod: deposit.depositType,
      partyId: context.partnerPartyId,
      lines: [
        debit(accounts.cashBank('PARTNER_DEPOSIT', deposit.depositType), amount),
        credit(accounts.system('PARTNER_SECURITY_DEPOSITS'), amount, { partyId: context.partnerPartyId }),
      ],
    });
  }
  const refundedOn = istDay(deposit.updatedAt);
  if (deposit.status === 'REFUNDED' && withinBooks(refundedOn, context.booksBegin)) {
    vouchers.push({
      key: 'REFUND',
      type: 'PAYMENT',
      date: refundedOn < receivedOn ? receivedOn : refundedOn,
      narration: 'Partner security deposit refunded',
      reference: deposit.referenceNo,
      paymentMethod: deposit.depositType,
      partyId: context.partnerPartyId,
      lines: [
        debit(accounts.system('PARTNER_SECURITY_DEPOSITS'), amount, { partyId: context.partnerPartyId }),
        credit(accounts.cashBank('PARTNER_DEPOSIT', deposit.depositType), amount),
      ],
    });
  }
  return vouchers;
};

export const buildWalletRechargeVouchers = (
  entry: { id: string; type: string; amountPaise: number; externalTransactionId: string | null; createdAt: Date },
  context: { accounts: AccountLookup; booksBegin: Date },
): DesiredVoucher[] => {
  if (entry.type !== 'CREDIT' || entry.amountPaise <= 0) return [];
  const date = istDay(entry.createdAt);
  if (!withinBooks(date, context.booksBegin)) return [];
  const amount = D(entry.amountPaise).dividedBy(100);
  return [{
    key: 'RECHARGE',
    type: 'PAYMENT',
    date,
    narration: 'Verification API wallet recharge',
    reference: entry.externalTransactionId,
    lines: [
      debit(context.accounts.system('PREPAID_API_WALLET'), amount),
      credit(context.accounts.cashBank('API_WALLET', 'RECHARGE'), amount),
    ],
  }];
};

/** One journal per IST day for all API usage of that day. */
export const buildWalletUsageVouchers = (
  day: Date,
  usagePaise: number,
  context: { accounts: AccountLookup; booksBegin: Date },
): DesiredVoucher[] => {
  if (usagePaise <= 0 || !withinBooks(day, context.booksBegin)) return [];
  const amount = D(usagePaise).dividedBy(100);
  return [{
    key: 'USAGE',
    type: 'JOURNAL',
    date: day,
    narration: `Verification API usage ${day.toISOString().slice(0, 10).split('-').reverse().join('-')}`,
    lines: [
      debit(context.accounts.system('API_EXPENSE'), amount),
      credit(context.accounts.system('PREPAID_API_WALLET'), amount),
    ],
  }];
};
