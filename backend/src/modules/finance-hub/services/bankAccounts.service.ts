import { FinAccountKind, FinBankAccountType, FinanceTransactionStatus, Prisma } from '@prisma/client';
import prisma from '../../../lib/prisma';
import { badRequest, notFound } from '../http';
import { isValidIfsc, normalizeIdentifier } from '../utils/india';
import { readBoolean, readEnum, readMoney, readString } from '../utils/input';
import { writeFinAudit } from './audit.service';
import type { ActorContext } from './context';
import { maskAccountNumber } from './parties.service';

const CASH_AND_BANK_GROUP = '1300';

export const ledgerKindForBankType = (type: FinBankAccountType): FinAccountKind => {
  if (type === 'CASH') return 'CASH';
  if (type === 'PETTY_CASH') return 'PETTY_CASH';
  if (type === 'WALLET') return 'WALLET';
  if (type === 'GATEWAY') return 'GATEWAY_CLEARING';
  return 'BANK';
};

const REQUIRES_ACCOUNT_NUMBER: FinBankAccountType[] = ['CURRENT', 'SAVINGS', 'OD', 'CC', 'VIRTUAL'];

/** Next free code in 1301–1349 for bank-type ledgers, 1351–1399 for cash, wallet and gateway. */
export const nextCashBankCode = (usedCodes: Set<string>, type: FinBankAccountType) => {
  const [from, to] = ledgerKindForBankType(type) === 'BANK' ? [1301, 1349] : [1351, 1399];
  for (let code = from; code <= to; code += 1) {
    if (!usedCodes.has(String(code))) return String(code);
  }
  return null;
};

const serialize = (record: Prisma.FinBankAccountGetPayload<{ include: { account: true } }>, canSeeNumbers: boolean) => ({
  ...record,
  accountNumber: canSeeNumbers ? record.accountNumber : maskAccountNumber(record.accountNumber),
  overdraftLimit: record.overdraftLimit === null ? null : record.overdraftLimit.toNumber(),
  account: { id: record.account.id, code: record.account.code, name: record.account.name, isActive: record.account.isActive },
});

const readAliases = (value: unknown) => {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw badRequest('Statement aliases must be a list.');
  const aliases = Array.from(new Set(value.map((item) => String(item).trim().toUpperCase()).filter(Boolean)));
  if (aliases.length > 20 || aliases.some((alias) => alias.length > 100)) throw badRequest('Up to 20 aliases of 100 characters each.');
  return aliases;
};

const readBankFields = (body: Record<string, unknown>, type: FinBankAccountType) => {
  const ifsc = body.ifsc ? normalizeIdentifier(body.ifsc) : null;
  if (ifsc && !isValidIfsc(ifsc)) throw badRequest('IFSC is not valid.');
  const accountNumber = body.accountNumber ? String(body.accountNumber).replace(/\s/g, '').toUpperCase() : null;
  if (accountNumber && !/^[0-9A-Z]{6,34}$/.test(accountNumber)) throw badRequest('Account number is not valid.');
  if (REQUIRES_ACCOUNT_NUMBER.includes(type) && !accountNumber) throw badRequest('Account number is required for bank accounts.');
  return {
    displayName: readString(body, 'displayName', 'Account name', { max: 100, required: true })!,
    bankName: readString(body, 'bankName', 'Bank name', { max: 100 })?.toUpperCase() ?? null,
    branch: readString(body, 'branch', 'Branch', { max: 100 }),
    accountNumber,
    ifsc,
    holderName: readString(body, 'holderName', 'Account holder', { max: 120 }),
    vanPrefix: readString(body, 'vanPrefix', 'Virtual account prefix', { max: 20 })?.toUpperCase() ?? null,
    overdraftLimit: readMoney(body, 'overdraftLimit', 'Overdraft limit'),
    custodianUserId: readString(body, 'custodianUserId', 'Custodian', { max: 60 }),
    parentBankAccountId: readString(body, 'parentBankAccountId', 'Parent bank account', { max: 60 }),
  };
};

const assertAliasesFree = async (tx: Prisma.TransactionClient, aliases: string[], excludeId?: string) => {
  if (!aliases.length) return;
  const clash = await tx.finBankAccount.findFirst({
    where: { statementAliases: { hasSome: aliases }, ...(excludeId ? { NOT: { id: excludeId } } : {}) },
    select: { displayName: true, statementAliases: true },
  });
  if (clash) {
    const used = clash.statementAliases.filter((alias) => aliases.includes(alias));
    throw badRequest(`${used.join(', ')} is already linked to ${clash.displayName}.`);
  }
};

const assertParent = async (tx: Prisma.TransactionClient, parentId: string | null, type: FinBankAccountType, selfId?: string) => {
  if (!parentId) return;
  if (type !== 'VIRTUAL') throw badRequest('Only virtual accounts have a parent bank account.');
  if (parentId === selfId) throw badRequest('An account cannot be its own parent.');
  const parent = await tx.finBankAccount.findUnique({ where: { id: parentId } });
  if (!parent || parent.type === 'VIRTUAL' || ledgerKindForBankType(parent.type) !== 'BANK') {
    throw badRequest('Parent must be a real bank account.');
  }
};

export const listBankAccounts = async (canSeeNumbers: boolean) => {
  const records = await prisma.finBankAccount.findMany({ include: { account: true }, orderBy: [{ isActive: 'desc' }, { displayName: 'asc' }] });
  return records.map((record) => serialize(record, canSeeNumbers));
};

/** Distinct bank names on old Expenses-page transactions that no bank account claims yet. */
export const listAliasSuggestions = async () => {
  const [usage, accounts] = await Promise.all([
    prisma.financeTransaction.groupBy({
      by: ['accountName'],
      where: { status: { not: FinanceTransactionStatus.VOIDED } },
      _count: { _all: true },
    }),
    prisma.finBankAccount.findMany({ select: { statementAliases: true } }),
  ]);
  const claimed = new Set(accounts.flatMap((account) => account.statementAliases));
  return usage
    .map((row) => ({ alias: row.accountName.trim().toUpperCase(), transactions: row._count._all }))
    .filter((row) => row.alias && !claimed.has(row.alias))
    .sort((left, right) => right.transactions - left.transactions);
};

export const createBankAccount = async (body: Record<string, unknown>, context: ActorContext, canSeeNumbers: boolean) => {
  const type = readEnum(body, 'type', 'Account type', Object.values(FinBankAccountType));
  const fields = readBankFields(body, type);
  const statementAliases = readAliases(body.statementAliases) ?? [];

  const record = await prisma.$transaction(async (tx) => {
    const group = await tx.finAccountGroup.findUnique({ where: { code: CASH_AND_BANK_GROUP } });
    if (!group) throw badRequest('Install the chart of accounts first (Accounting & Books → Chart of Accounts).');
    await assertAliasesFree(tx, statementAliases);
    await assertParent(tx, fields.parentBankAccountId, type);

    const usedCodes = new Set((await tx.finAccount.findMany({ where: { code: { startsWith: '13' } }, select: { code: true } })).map((item) => item.code));
    const code = nextCashBankCode(usedCodes, type);
    if (!code) throw badRequest('No free ledger code left under Cash & Bank. Add a sub-group in the chart of accounts.');

    const account = await tx.finAccount.create({
      data: {
        code,
        name: fields.displayName,
        groupId: group.id,
        kind: ledgerKindForBankType(type),
        normalBalance: 'DR',
        tallyName: fields.displayName,
      },
    });
    const created = await tx.finBankAccount.create({
      data: { ...fields, type, statementAliases, accountId: account.id },
      include: { account: true },
    });
    await writeFinAudit({ ...context, entityType: 'FinBankAccount', entityId: created.id, action: 'CREATE', after: { ...created, accountNumber: maskAccountNumber(created.accountNumber) } }, tx);
    return created;
  });
  return serialize(record, canSeeNumbers);
};

export const updateBankAccount = async (id: string, body: Record<string, unknown>, context: ActorContext, canSeeNumbers: boolean) => {
  const record = await prisma.$transaction(async (tx) => {
    const before = await tx.finBankAccount.findUnique({ where: { id }, include: { account: true } });
    if (!before) throw notFound('Bank account not found.');
    const sentMaskedNumber = typeof body.accountNumber === 'string' && body.accountNumber.includes('X');
    const fields = readBankFields({ ...before, overdraftLimit: before.overdraftLimit?.toString() ?? null, ...body, ...(sentMaskedNumber ? { accountNumber: before.accountNumber } : {}) }, before.type);
    const statementAliases = readAliases(body.statementAliases);
    const isActive = readBoolean(body, 'isActive', before.isActive);
    if (statementAliases) await assertAliasesFree(tx, statementAliases, id);
    await assertParent(tx, fields.parentBankAccountId, before.type, id);

    const updated = await tx.finBankAccount.update({
      where: { id },
      data: { ...fields, ...(statementAliases ? { statementAliases } : {}), isActive },
      include: { account: true },
    });
    if (fields.displayName !== before.account.name || isActive !== before.account.isActive) {
      await tx.finAccount.update({ where: { id: before.accountId }, data: { name: fields.displayName, isActive } });
    }
    await writeFinAudit({
      ...context,
      entityType: 'FinBankAccount',
      entityId: id,
      action: 'UPDATE',
      before: { ...before, accountNumber: maskAccountNumber(before.accountNumber) },
      after: { ...updated, accountNumber: maskAccountNumber(updated.accountNumber) },
    }, tx);
    return tx.finBankAccount.findUniqueOrThrow({ where: { id }, include: { account: true } });
  });
  return serialize(record, canSeeNumbers);
};
