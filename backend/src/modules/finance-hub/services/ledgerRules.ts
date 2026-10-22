import { FinAccountKind, FinPeriodStatus, FinVoucherStatus, FinVoucherType, Prisma } from '@prisma/client';
import { badRequest } from '../http';
import { readDate, readEnum, readMoney, readMultiline, readString } from '../utils/input';
import { roundMoney, sumMoney } from '../utils/money';

// Pure double-entry rules shared by manual vouchers, opening balances and (later) automatic posting.

export const MANUAL_VOUCHER_TYPES = ['JOURNAL', 'PAYMENT', 'RECEIPT', 'CONTRA', 'ADJUSTMENT'] as const satisfies readonly FinVoucherType[];
export type ManualVoucherType = (typeof MANUAL_VOUCHER_TYPES)[number];

export const CASH_BANK_KINDS: FinAccountKind[] = ['BANK', 'CASH', 'PETTY_CASH', 'WALLET', 'GATEWAY_CLEARING'];

/** Statuses whose lines are part of the books. A reversed voucher stays in, next to its reversal. */
export const LEDGER_STATUSES: FinVoucherStatus[] = ['POSTED', 'REVERSED'];

export const PAYMENT_METHODS = ['CASH', 'UPI', 'NEFT', 'RTGS', 'IMPS', 'BANK_TRANSFER', 'CHEQUE', 'CARD', 'OTHER'] as const;

export const MAX_VOUCHER_LINES = 200;

export type VoucherLineInput = {
  accountId: string;
  partyId: string | null;
  sellAccountId: string | null;
  costCentreId: string | null;
  debit: Prisma.Decimal;
  credit: Prisma.Decimal;
  narration: string | null;
  billRef: string | null;
};

export type VoucherInput = {
  type: FinVoucherType;
  date: Date;
  narration: string;
  reference: string | null;
  paymentMethod: string | null;
  partyId: string | null;
  sellAccountId: string | null;
  costCentreId: string | null;
  lines: VoucherLineInput[];
};

const ZERO = new Prisma.Decimal(0);

export const parseVoucherInput = (body: Record<string, unknown>, allowedTypes: readonly FinVoucherType[]): VoucherInput => {
  const rawLines = Array.isArray(body.lines) ? body.lines : null;
  if (!rawLines) throw badRequest('Voucher lines are required.');
  if (rawLines.length > MAX_VOUCHER_LINES) throw badRequest(`A voucher can have up to ${MAX_VOUCHER_LINES} lines.`);

  const lines = rawLines.map((raw, index) => {
    const row = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const at = `Line ${index + 1}`;
    return {
      accountId: readString(row, 'accountId', `${at}: ledger`, { max: 60, required: true })!,
      partyId: readString(row, 'partyId', `${at}: party`, { max: 60 }),
      sellAccountId: readString(row, 'sellAccountId', `${at}: vehicle`, { max: 60 }),
      costCentreId: readString(row, 'costCentreId', `${at}: cost centre`, { max: 60 }),
      debit: readMoney(row, 'debit', `${at}: debit`) ?? ZERO,
      credit: readMoney(row, 'credit', `${at}: credit`) ?? ZERO,
      narration: readString(row, 'narration', `${at}: narration`, { max: 300 }),
      billRef: readString(row, 'billRef', `${at}: bill reference`, { max: 60 })?.toUpperCase() ?? null,
    };
  }).filter((line) => !(line.debit.isZero() && line.credit.isZero()));

  const paymentMethod = body.paymentMethod ? readEnum(body, 'paymentMethod', 'Payment method', PAYMENT_METHODS) : null;

  return {
    type: readEnum(body, 'type', 'Voucher type', allowedTypes),
    date: readDate(body, 'date', 'Voucher date', true)!,
    narration: readMultiline(body, 'narration', 'Narration', 1000) ?? '',
    reference: readString(body, 'reference', 'Reference', { max: 80 })?.toUpperCase() ?? null,
    paymentMethod,
    partyId: readString(body, 'partyId', 'Party', { max: 60 }),
    sellAccountId: readString(body, 'sellAccountId', 'Vehicle', { max: 60 }),
    costCentreId: readString(body, 'costCentreId', 'Cost centre', { max: 60 }),
    lines,
  };
};

export type LedgerAccount = {
  id: string;
  code: string;
  name: string;
  kind: FinAccountKind;
  isActive: boolean;
  allowManualPosting: boolean;
  requiresParty: boolean;
  requiresVehicle: boolean;
  requiresCostCentre: boolean;
};

export type LedgerReferences = {
  accounts: Map<string, LedgerAccount>;
  parties: Set<string>;
  costCentres: Set<string>;
  vehicles: Set<string>;
};

/**
 * Validates lines and type rules and returns the voucher total. `manual` enforces each ledger's
 * "allow manual vouchers" flag; system postings (opening balances, automatic posting) skip it.
 */
export const validateVoucher = (input: Pick<VoucherInput, 'type' | 'lines' | 'narration' | 'partyId' | 'costCentreId' | 'sellAccountId'>, refs: LedgerReferences, options: { manual: boolean }) => {
  if (!input.narration.trim()) throw badRequest('Narration is required.');
  if (input.lines.length < 2) throw badRequest('A voucher needs at least two lines (one debit and one credit).');
  if (input.partyId && !refs.parties.has(input.partyId)) throw badRequest('Party not found.');
  if (input.costCentreId && !refs.costCentres.has(input.costCentreId)) throw badRequest('Cost centre not found.');
  if (input.sellAccountId && !refs.vehicles.has(input.sellAccountId)) throw badRequest('Vehicle (Sold Vehicle record) not found.');

  input.lines.forEach((line, index) => {
    const at = `Line ${index + 1}`;
    const account = refs.accounts.get(line.accountId);
    if (!account) throw badRequest(`${at}: ledger not found.`);
    if (!account.isActive) throw badRequest(`${at}: ${account.name} is inactive.`);
    if (options.manual && !account.allowManualPosting) throw badRequest(`${at}: ${account.name} is posted automatically and cannot be used in a manual voucher.`);
    if (line.debit.isNegative() || line.credit.isNegative()) throw badRequest(`${at}: amounts cannot be negative.`);
    if (!line.debit.isZero() && !line.credit.isZero()) throw badRequest(`${at}: enter either debit or credit, not both.`);
    if (account.requiresParty && !line.partyId) throw badRequest(`${at}: ${account.name} needs a party.`);
    if (account.requiresVehicle && !line.sellAccountId) throw badRequest(`${at}: ${account.name} needs a vehicle.`);
    if (account.requiresCostCentre && !line.costCentreId) throw badRequest(`${at}: ${account.name} needs a cost centre.`);
    if (line.partyId && !refs.parties.has(line.partyId)) throw badRequest(`${at}: party not found.`);
    if (line.costCentreId && !refs.costCentres.has(line.costCentreId)) throw badRequest(`${at}: cost centre not found.`);
    if (line.sellAccountId && !refs.vehicles.has(line.sellAccountId)) throw badRequest(`${at}: vehicle not found.`);
  });

  const debit = sumMoney(input.lines.map((line) => line.debit));
  const credit = sumMoney(input.lines.map((line) => line.credit));
  if (debit.isZero()) throw badRequest('Voucher amount must be greater than zero.');
  if (!debit.equals(credit)) {
    throw badRequest(`Debit (${debit.toFixed(2)}) and credit (${credit.toFixed(2)}) must be equal. Difference ${roundMoney(debit.minus(credit)).toFixed(2)}.`);
  }

  const isCashBank = (line: VoucherLineInput) => CASH_BANK_KINDS.includes(refs.accounts.get(line.accountId)!.kind);
  const cashBankDebits = input.lines.filter((line) => isCashBank(line) && !line.debit.isZero());
  const cashBankCredits = input.lines.filter((line) => isCashBank(line) && !line.credit.isZero());

  switch (input.type) {
    case 'PAYMENT':
      if (!cashBankCredits.length) throw badRequest('A payment voucher must credit a bank or cash account.');
      if (cashBankDebits.length) throw badRequest('Money moving between bank/cash accounts is a contra voucher, not a payment.');
      break;
    case 'RECEIPT':
      if (!cashBankDebits.length) throw badRequest('A receipt voucher must debit a bank or cash account.');
      if (cashBankCredits.length) throw badRequest('Money moving between bank/cash accounts is a contra voucher, not a receipt.');
      break;
    case 'CONTRA':
      // System postings (e.g. gateway settlements) may add charge lines to the transfer.
      if (options.manual && input.lines.some((line) => !isCashBank(line))) throw badRequest('A contra voucher can only use bank, cash, wallet or gateway accounts.');
      if (!cashBankDebits.length || !cashBankCredits.length) throw badRequest('A contra voucher moves money from one bank/cash account to another.');
      break;
    case 'JOURNAL':
    case 'ADJUSTMENT':
      if (cashBankDebits.length || cashBankCredits.length) throw badRequest('Use a payment, receipt or contra voucher for bank and cash movements.');
      break;
    default:
      break;
  }

  return debit;
};

/** Why a voucher dated in this period cannot be posted, or null. */
export const periodPostingError = (period: { status: FinPeriodStatus; label: string }, canPostSoftClosed: boolean) => {
  if (period.status === 'LOCKED') return `${period.label} is locked. Reopen the month or date the voucher in an open month.`;
  if (period.status === 'SOFT_CLOSED' && !canPostSoftClosed) return `${period.label} is soft closed. Only users who can close periods may post into it.`;
  return null;
};

export type ApprovalPolicy = { threshold: Prisma.Decimal | null; cashRequiresApproval: boolean };

export const needsApproval = (policy: ApprovalPolicy, total: Prisma.Decimal, lineKinds: FinAccountKind[]) =>
  Boolean(policy.threshold && total.greaterThanOrEqualTo(policy.threshold)) ||
  (policy.cashRequiresApproval && lineKinds.some((kind) => kind === 'CASH' || kind === 'PETTY_CASH'));

export const reversedLines = <T extends { debit: Prisma.Decimal; credit: Prisma.Decimal }>(lines: T[]) =>
  lines.map((line) => ({ ...line, debit: line.credit, credit: line.debit }));
