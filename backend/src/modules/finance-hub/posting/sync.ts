import { FinAccountKind, FinPostingMode, Prisma } from '@prisma/client';
import prisma from '../../../lib/prisma';
import { getAppSettings } from '../../../utils/appSettings';
import { CASH_BANK_KINDS, validateVoucher, type VoucherLineInput } from '../services/ledgerRules';
import { assignNumber, auditVoucher, lineRows, loadReferences, lockedInclude, reverseInTx, type LedgerAccess, type LockedVoucher } from '../services/ledger.service';
import { resolvePartyForCandidate, type PartyCandidate } from '../services/parties.service';
import { FIN_SETTINGS_ID, readPostingConfig } from '../services/settings.service';
import { normalizeGstin, isValidGstin, normalizeIndianMobile } from '../utils/india';
import { istToday } from '../utils/fy';
import {
  buildCustomerPrimeVouchers,
  buildListingPaymentVouchers,
  buildPartnerDepositVouchers,
  buildSellAccountVouchers,
  buildWalletRechargeVouchers,
  buildWalletUsageVouchers,
  PostingError,
  voucherHash,
  type AccountLookup,
  type DesiredVoucher,
} from './builders';

type Tx = Prisma.TransactionClient;

export const POSTING_SOURCE_TYPES = ['SELL_ACCOUNT', 'LISTING_PAYMENT', 'CUSTOMER_PRIME', 'PARTNER_DEPOSIT', 'API_WALLET_LEDGER', 'API_WALLET_DAY'] as const;
export type PostingSourceType = (typeof POSTING_SOURCE_TYPES)[number];

/** Which settings toggle controls a queue source type. */
export const configSourceOf = (sourceType: PostingSourceType) => (sourceType.startsWith('API_WALLET') ? 'API_WALLET' : sourceType) as
  'SELL_ACCOUNT' | 'LISTING_PAYMENT' | 'CUSTOMER_PRIME' | 'PARTNER_DEPOSIT' | 'API_WALLET';

const SYSTEM_ACCESS: LedgerAccess = {
  actor: { actorUserId: null, ipAddress: null, userAgent: null },
  isSuperAdmin: false,
  canPostSoftClosed: false,
  canApprove: false,
};

const IST_MS = 330 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

const DEFAULT_METHOD_KEYS: Record<string, string> = { CASH: 'CASH_IN_HAND', RAZORPAY: 'GATEWAY_RAZORPAY', PHONEPE: 'GATEWAY_PHONEPE' };

export const buildAccountLookup = (
  accounts: Array<{ id: string; code: string; systemKey: string | null; kind: FinAccountKind; isActive: boolean }>,
  methodMap: Record<string, Record<string, string | null>>,
): AccountLookup => {
  const bySystemKey = new Map(accounts.filter((account) => account.systemKey).map((account) => [account.systemKey!, account]));
  const byCode = new Map(accounts.map((account) => [account.code, account]));
  const byId = new Map(accounts.map((account) => [account.id, account]));
  const activeBanks = accounts.filter((account) => account.kind === 'BANK' && account.isActive);
  return {
    system: (key) => {
      const account = bySystemKey.get(key);
      if (!account) throw new PostingError(`Ledger with system role ${key} is missing. Install the default chart of accounts.`);
      return account.id;
    },
    code: (code) => {
      const account = byCode.get(code);
      if (!account) throw new PostingError(`Ledger ${code} is missing from the chart of accounts.`);
      return account.id;
    },
    cashBank: (source, method) => {
      const mapped = methodMap[source]?.[method];
      const mappedAccount = mapped ? byId.get(mapped) : undefined;
      if (mappedAccount && mappedAccount.isActive && CASH_BANK_KINDS.includes(mappedAccount.kind)) return mappedAccount.id;
      const defaultKey = DEFAULT_METHOD_KEYS[method];
      if (defaultKey && bySystemKey.get(defaultKey)?.isActive) return bySystemKey.get(defaultKey)!.id;
      if (activeBanks.length === 1) return activeBanks[0]!.id;
      throw new PostingError(`Choose the bank/cash account for ${source.replace(/_/g, ' ').toLowerCase()} payments by ${method.replace(/_/g, ' ').toLowerCase()} in Finance Settings → Account & Ledger Masters → Payment methods.`);
    },
  };
};

type SyncContext = { accounts: AccountLookup; booksBegin: Date; capitaliseCosts: boolean };

const loadContext = async (tx: Tx): Promise<SyncContext> => {
  const [settings, accounts, firstYear] = [
    await tx.finSettings.findUnique({ where: { id: FIN_SETTINGS_ID } }),
    await tx.finAccount.findMany({ select: { id: true, code: true, systemKey: true, kind: true, isActive: true } }),
    await tx.finFinancialYear.findFirst({ orderBy: { startDate: 'asc' } }),
  ];
  if (!firstYear) throw new PostingError('Create a financial year first (Finance Settings → Financial Year & Periods).');
  const config = (settings?.config && typeof settings.config === 'object' && !Array.isArray(settings.config) ? settings.config : {}) as Record<string, unknown>;
  const methodMap = (config.paymentMethodAccounts ?? {}) as Record<string, Record<string, string | null>>;
  const booksBegin = settings?.booksBeginDate && settings.booksBeginDate > firstYear.startDate ? settings.booksBeginDate : firstYear.startDate;
  return { accounts: buildAccountLookup(accounts, methodMap), booksBegin, capitaliseCosts: readPostingConfig(settings?.config).capitaliseVehicleCosts };
};

const cleanName = (value: string | null | undefined) => (value || '').replace(/\s+/g, ' ').trim().slice(0, 160);
const validGstinOrNull = (value: string | null | undefined) => {
  const gstin = value ? normalizeGstin(value) : '';
  return gstin && isValidGstin(gstin) ? gstin : null;
};

// ---------------------------------------------------------------------------
// Desired vouchers per source
// ---------------------------------------------------------------------------

const desiredForSource = async (tx: Tx, sourceType: PostingSourceType, sourceId: string, context: SyncContext): Promise<DesiredVoucher[]> => {
  switch (sourceType) {
    case 'SELL_ACCOUNT': {
      const deal = await tx.sellAccount.findUnique({ where: { id: sourceId }, include: { payments: { orderBy: [{ paymentDate: 'asc' }, { createdAt: 'asc' }] } } });
      if (!deal || deal.isDraft || deal.deletedAt) return [];
      const ownStock = deal.sourceType === 'JCB_EXCHANGE';
      const hasSellerPayments = deal.payments.some((payment) => payment.side === 'SELLER_PAYMENT');
      const needsSeller = (!ownStock && Number(deal.purchaseAmount) > 0) || hasSellerPayments;
      const needsPurchaser = Number(deal.sellAmount) > 0 || deal.payments.some((payment) => payment.side === 'PURCHASER_RECEIPT');
      const seller: PartyCandidate = {
        linkType: 'SELL_ACCOUNT_SELLER',
        linkId: deal.id,
        type: deal.sourceType === 'PARTNER' ? 'PARTNER' : deal.sourceType === 'AGENT' ? 'AGENT' : 'SELLER',
        name: cleanName(deal.sellerName) || `Seller of ${deal.recordNumber}`,
        mobile: normalizeIndianMobile(deal.sellerNumber),
        gstin: null,
        city: deal.sellerCity,
        state: deal.sellerState,
      };
      const purchaser: PartyCandidate = {
        linkType: 'SELL_ACCOUNT_PURCHASER',
        linkId: deal.id,
        type: 'CUSTOMER',
        name: cleanName(deal.purchaserName) || `Purchaser of ${deal.recordNumber}`,
        mobile: normalizeIndianMobile(deal.purchaserNumber),
        gstin: null,
        city: deal.purchaserCity,
        state: deal.purchaserState,
      };
      const sellerPartyId = needsSeller ? await resolvePartyForCandidate(tx, seller) : null;
      const purchaserPartyId = needsPurchaser ? await resolvePartyForCandidate(tx, purchaser) : null;
      return buildSellAccountVouchers(deal, { accounts: context.accounts, sellerPartyId, purchaserPartyId, booksBegin: context.booksBegin, capitaliseCosts: context.capitaliseCosts });
    }
    case 'LISTING_PAYMENT': {
      const payment = await tx.listingPaymentSubmission.findUnique({
        where: { id: sourceId },
        include: { buyer: { select: { id: true, name: true, mobile: true } }, listing: { select: { title: true } } },
      });
      if (!payment || !['APPROVED', 'PAID'].includes(payment.status)) return [];
      const buyerPartyId = await resolvePartyForCandidate(tx, {
        linkType: 'USER',
        linkId: payment.buyerId,
        type: 'CUSTOMER',
        name: cleanName(payment.buyer.name) || payment.buyer.mobile || 'Listing buyer',
        mobile: normalizeIndianMobile(payment.buyer.mobile),
        gstin: null,
        city: payment.customerCity,
        state: payment.customerState,
      });
      return buildListingPaymentVouchers({ ...payment, listingTitle: payment.listing?.title ?? null }, { accounts: context.accounts, buyerPartyId, booksBegin: context.booksBegin });
    }
    case 'CUSTOMER_PRIME': {
      const subscription = await tx.customerPrimeSubscription.findUnique({ where: { id: sourceId } });
      if (!subscription) return [];
      const company = (await getAppSettings()).companyInvoice;
      return buildCustomerPrimeVouchers(subscription, { accounts: context.accounts, booksBegin: context.booksBegin, gstRatePercent: company.defaultGstRate || 18, companyState: company.state });
    }
    case 'PARTNER_DEPOSIT': {
      const deposit = await tx.partnerDeposit.findUnique({
        where: { id: sourceId },
        include: { partnerProfile: { select: { id: true, businessName: true, ownerName: true, gstNumber: true, user: { select: { name: true, mobile: true, city: true, state: true } } } } },
      });
      if (!deposit) return [];
      const profile = deposit.partnerProfile;
      const needsParty = Number(deposit.amount ?? 0) > 0 && ['VERIFIED', 'REFUND_REQUESTED', 'REFUNDED'].includes(deposit.status);
      const partnerPartyId = needsParty
        ? await resolvePartyForCandidate(tx, {
            linkType: 'PARTNER_PROFILE',
            linkId: profile.id,
            type: 'PARTNER',
            name: cleanName(profile.businessName || profile.ownerName || profile.user?.name) || 'Partner',
            mobile: normalizeIndianMobile(profile.user?.mobile ?? null),
            gstin: validGstinOrNull(profile.gstNumber),
            city: profile.user?.city ?? null,
            state: profile.user?.state ?? null,
          })
        : null;
      return buildPartnerDepositVouchers(deposit, { accounts: context.accounts, partnerPartyId, booksBegin: context.booksBegin });
    }
    case 'API_WALLET_LEDGER': {
      const entry = await tx.apiWalletLedger.findUnique({ where: { id: sourceId } });
      return entry ? buildWalletRechargeVouchers(entry, context) : [];
    }
    case 'API_WALLET_DAY': {
      const day = new Date(`${sourceId}T00:00:00.000Z`);
      if (Number.isNaN(day.getTime())) return [];
      const start = new Date(day.getTime() - IST_MS);
      const usage = await tx.apiWalletLedger.aggregate({ where: { type: 'DEBIT', createdAt: { gte: start, lt: new Date(start.getTime() + DAY_MS) } }, _sum: { amountPaise: true } });
      return buildWalletUsageVouchers(day, usage._sum.amountPaise ?? 0, context);
    }
    default:
      return [];
  }
};

// ---------------------------------------------------------------------------
// Reconcile desired vouchers with what the books already have
// ---------------------------------------------------------------------------

/** Puts a voucher in an open month: its own date when possible, otherwise today. */
const placeInOpenPeriod = async (tx: Tx, date: Date) => {
  const findOpen = (day: Date) => tx.finPeriod.findFirst({
    where: { startDate: { lte: day }, endDate: { gte: day }, status: 'OPEN', year: { status: { not: 'LOCKED' } } },
    include: { year: true },
  });
  const own = await findOpen(date);
  if (own) return { period: own, date, moved: false };
  const today = istToday();
  if (today < date) throw new PostingError(`No open month for ${date.toISOString().slice(0, 10)}. Create or reopen the financial year.`);
  const current = await findOpen(today);
  if (!current) throw new PostingError(`The month of ${date.toISOString().slice(0, 10)} is closed and the current month is not open.`);
  return { period: current, date: today, moved: true };
};

const toLineInputs = (lines: DesiredVoucher['lines']): VoucherLineInput[] =>
  lines.filter((line) => line.debit.greaterThan(0) || line.credit.greaterThan(0)).map((line) => ({
    accountId: line.accountId,
    partyId: line.partyId ?? null,
    sellAccountId: line.sellAccountId ?? null,
    costCentreId: null,
    debit: line.debit,
    credit: line.credit,
    narration: line.narration ?? null,
    billRef: null,
  }));

const createSystemVoucher = async (tx: Tx, sourceType: string, sourceId: string, desired: DesiredVoucher, hash: string, mode: 'SHADOW' | 'LIVE') => {
  const lines = toLineInputs(desired.lines);
  const placed = await placeInOpenPeriod(tx, desired.date);
  const narration = placed.moved ? `${desired.narration} (belongs to ${desired.date.toISOString().slice(0, 10).split('-').reverse().join('-')}; that month is closed)` : desired.narration;
  const refs = await loadReferences(tx, { lines, partyId: desired.partyId ?? null, costCentreId: null, sellAccountId: desired.sellAccountId ?? null });
  const total = validateVoucher({ type: desired.type, lines, narration, partyId: desired.partyId ?? null, costCentreId: null, sellAccountId: desired.sellAccountId ?? null }, refs, { manual: false });
  const posted = mode === 'LIVE';
  const now = new Date();
  const voucher = await tx.finVoucher.create({
    data: {
      number: posted ? await assignNumber(tx, desired.type, placed.period.year) : null,
      type: desired.type,
      date: placed.date,
      yearId: placed.period.yearId,
      periodId: placed.period.id,
      status: posted ? 'POSTED' : 'DRAFT',
      narration,
      reference: desired.reference?.slice(0, 80) ?? null,
      paymentMethod: desired.paymentMethod?.slice(0, 20) ?? null,
      partyId: desired.partyId ?? null,
      sellAccountId: desired.sellAccountId ?? null,
      totalAmount: total,
      sourceType,
      sourceId,
      sourceEvent: desired.key,
      sourceHash: hash,
      ...(posted ? { postedAt: now } : {}),
      lines: { create: lineRows(lines) },
    },
  });
  await auditVoucher(tx, SYSTEM_ACCESS, voucher, posted ? 'AUTO_POST' : 'AUTO_DRAFT', { source: `${sourceType}:${sourceId}`, key: desired.key });
  return voucher.id;
};

/** Removes a voucher that no longer matches its source: drafts are deleted, posted ones reversed. */
const retire = async (tx: Tx, voucher: LockedVoucher, reason: string) => {
  if (voucher.status === 'POSTED') {
    const placed = await placeInOpenPeriod(tx, voucher.date);
    await reverseInTx(tx, voucher, SYSTEM_ACCESS, placed.moved ? `${reason} (original month is closed)` : reason, placed.date, { allowSystem: true });
    return 'reversed' as const;
  }
  await tx.finVoucher.delete({ where: { id: voucher.id } });
  await auditVoucher(tx, SYSTEM_ACCESS, voucher, 'AUTO_DRAFT_REMOVED', { reason });
  return 'deleted' as const;
};

const postExistingDraft = async (tx: Tx, voucher: LockedVoucher) => {
  const placed = await placeInOpenPeriod(tx, voucher.date);
  const number = await assignNumber(tx, voucher.type, placed.period.year);
  const updated = await tx.finVoucher.update({
    where: { id: voucher.id },
    data: { status: 'POSTED', number, date: placed.date, yearId: placed.period.yearId, periodId: placed.period.id, postedAt: new Date() },
  });
  await auditVoucher(tx, SYSTEM_ACCESS, updated, 'AUTO_POST_DRAFT');
};

export type SyncSummary = {
  sourceType: string;
  sourceId: string;
  desired: number;
  unchanged: number;
  created: number;
  posted: number;
  reversed: number;
  deletedDrafts: number;
  vouchers: Array<{ key: string; type: string; date: string; total: number; lines: Array<{ accountId: string; debit: number; credit: number }> }>;
};

class DryRunRollback extends Error {
  constructor(public summary: SyncSummary) {
    super('dry run');
  }
}

/**
 * Brings the books in line with one source record. Safe to repeat: vouchers whose financial
 * content (hash) is unchanged are left alone; changed ones are reversed (or deleted while
 * still drafts) and re-created. Runs under a per-source advisory lock.
 */
export const syncSource = async (sourceType: PostingSourceType, sourceId: string, options: { mode: 'SHADOW' | 'LIVE'; dryRun?: boolean }): Promise<SyncSummary> => {
  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`finance-hub:${sourceType}:${sourceId}`}))`;
      const context = await loadContext(tx);
      const desired = await desiredForSource(tx, sourceType, sourceId, context);
      const existing = await tx.finVoucher.findMany({
        where: { sourceType, sourceId, reversalOfId: null, status: { in: ['DRAFT', 'PENDING_APPROVAL', 'POSTED'] } },
        include: lockedInclude,
        orderBy: { createdAt: 'asc' },
      });
      const summary: SyncSummary = { sourceType, sourceId, desired: desired.length, unchanged: 0, created: 0, posted: 0, reversed: 0, deletedDrafts: 0, vouchers: [] };
      const matched = new Set<string>();

      for (const voucher of desired) {
        const hash = voucherHash(voucher);
        summary.vouchers.push({
          key: voucher.key,
          type: voucher.type,
          date: voucher.date.toISOString().slice(0, 10),
          total: voucher.lines.reduce((sum, line) => sum + line.debit.toNumber(), 0),
          lines: voucher.lines.map((line) => ({ accountId: line.accountId, debit: line.debit.toNumber(), credit: line.credit.toNumber() })),
        });
        const current = existing.find((item) => item.sourceEvent === voucher.key && !matched.has(item.id));
        if (current && current.sourceHash === hash) {
          matched.add(current.id);
          if (options.mode === 'LIVE' && current.status !== 'POSTED') {
            await postExistingDraft(tx, current);
            summary.posted += 1;
          } else {
            summary.unchanged += 1;
          }
          continue;
        }
        if (current) {
          matched.add(current.id);
          const outcome = await retire(tx, current, 'Source record changed');
          if (outcome === 'reversed') summary.reversed += 1; else summary.deletedDrafts += 1;
        }
        await createSystemVoucher(tx, sourceType, sourceId, voucher, hash, options.mode);
        summary.created += 1;
      }

      for (const voucher of existing) {
        if (matched.has(voucher.id)) continue;
        const outcome = await retire(tx, voucher, 'No longer in the source record');
        if (outcome === 'reversed') summary.reversed += 1; else summary.deletedDrafts += 1;
      }

      if (options.dryRun) throw new DryRunRollback(summary);
      return summary;
    }, { timeout: 60000, maxWait: 15000 });
  } catch (error) {
    if (error instanceof DryRunRollback) return error.summary;
    throw error;
  }
};

export const isPostingMode = (mode: FinPostingMode): mode is 'SHADOW' | 'LIVE' => mode === 'SHADOW' || mode === 'LIVE';
