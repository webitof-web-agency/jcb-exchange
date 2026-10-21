import { FinAccountKind, FinAccountNature, FinBalanceSide, FinanceTransactionStatus, Prisma } from '@prisma/client';
import prisma from '../../../lib/prisma';
import { badRequest, conflict, notFound } from '../http';
import { DEFAULT_ACCOUNTS, DEFAULT_CATEGORY_MAP, DEFAULT_GROUPS } from '../seed/defaultChart';
import { onlyProvided, readBoolean, readEnum, readInt, readMultiline, readRate, readString } from '../utils/input';
import { writeFinAudit } from './audit.service';
import { sequential, type ActorContext } from './context';
import { FIN_SETTINGS_ID } from './settings.service';

const CODE_PATTERN = /^[0-9A-Z][0-9A-Z-]{1,11}$/;

const readCode = (body: Record<string, unknown>, label: string) => {
  const code = readString(body, 'code', label, { max: 12, required: true })!.toUpperCase();
  if (!CODE_PATTERN.test(code)) throw badRequest(`${label} must be 2-12 letters, digits or hyphens.`);
  return code;
};

// Bank, cash and gateway ledgers are created from the Bank Accounts master so they always
// carry their bank details; the chart editor cannot create them directly.
const BANK_MASTER_KINDS: FinAccountKind[] = ['BANK', 'CASH', 'PETTY_CASH', 'WALLET', 'GATEWAY_CLEARING'];

export const defaultNormalBalance = (nature: FinAccountNature): FinBalanceSide =>
  nature === 'ASSET' || nature === 'EXPENSE' ? 'DR' : 'CR';

export const getChartOfAccounts = async () => {
  const [groups, accounts] = await Promise.all([
    prisma.finAccountGroup.findMany({ orderBy: [{ code: 'asc' }] }),
    prisma.finAccount.findMany({
      orderBy: [{ code: 'asc' }],
      include: { bankAccount: { select: { id: true, type: true } } },
    }),
  ]);
  return { groups, accounts, installed: groups.length > 0 };
};

type InstallState = {
  groupCodes: Set<string>;
  accountCodes: Set<string>;
  systemKeys: Set<string>;
  mappedCategories: Set<string>;
};

/** Pure plan of what installing the default chart would add. Existing rows are never touched. */
export const planDefaultChartInstall = (state: InstallState) => {
  const groups = DEFAULT_GROUPS.filter((group) => !state.groupCodes.has(group.code));
  const conflicts: string[] = [];
  const accounts = DEFAULT_ACCOUNTS.filter((account) => {
    if (state.accountCodes.has(account.code)) return false;
    if (account.systemKey && state.systemKeys.has(account.systemKey)) {
      conflicts.push(`${account.code} ${account.name}: system key ${account.systemKey} already belongs to another ledger`);
      return false;
    }
    return true;
  });
  const availableCodes = new Set([...state.accountCodes, ...accounts.map((account) => account.code)]);
  const categoryMaps = Object.entries(DEFAULT_CATEGORY_MAP)
    .filter(([category, code]) => !state.mappedCategories.has(category) && availableCodes.has(code))
    .map(([category, code]) => ({ category, code }));
  return { groups, accounts, categoryMaps, conflicts };
};

export const installDefaultChart = async (body: Record<string, unknown>, context: ActorContext) => {
  const dryRun = readBoolean(body, 'dryRun', true);

  return prisma.$transaction(async (tx) => {
    const [groups, accounts, maps] = await sequential([
      tx.finAccountGroup.findMany({ select: { id: true, code: true } }),
      tx.finAccount.findMany({ select: { id: true, code: true, systemKey: true } }),
      tx.finCategoryMap.findMany({ select: { category: true } }),
    ]);
    const plan = planDefaultChartInstall({
      groupCodes: new Set(groups.map((group) => group.code)),
      accountCodes: new Set(accounts.map((account) => account.code)),
      systemKeys: new Set(accounts.flatMap((account) => (account.systemKey ? [account.systemKey] : []))),
      mappedCategories: new Set(maps.map((map) => map.category)),
    });
    const summary = {
      dryRun,
      groupsToCreate: plan.groups.map((group) => `${group.code} ${group.name}`),
      accountsToCreate: plan.accounts.map((account) => `${account.code} ${account.name}`),
      categoryMapsToCreate: plan.categoryMaps.map((map) => `${map.category} → ${map.code}`),
      conflicts: plan.conflicts,
      existingGroups: groups.length,
      existingAccounts: accounts.length,
    };
    if (dryRun) return summary;

    const groupIds = new Map(groups.map((group) => [group.code, group.id]));
    for (const [index, group] of plan.groups.entries()) {
      const created = await tx.finAccountGroup.create({
        data: {
          code: group.code,
          name: group.name,
          nature: group.nature,
          parentId: group.parentCode ? groupIds.get(group.parentCode) ?? null : null,
          reportLine: group.reportLine ?? null,
          sortOrder: index,
          isSystem: true,
        },
      });
      groupIds.set(group.code, created.id);
    }

    const accountIds = new Map(accounts.map((account) => [account.code, account.id]));
    for (const account of plan.accounts) {
      const groupId = groupIds.get(account.groupCode);
      if (!groupId) continue;
      const created = await tx.finAccount.create({
        data: {
          code: account.code,
          name: account.name,
          groupId,
          kind: account.kind ?? 'GENERAL',
          normalBalance: account.normalBalance,
          systemKey: account.systemKey ?? null,
          isSystem: Boolean(account.systemKey),
          allowManualPosting: account.manual ?? true,
          requiresParty: account.party ?? false,
          requiresVehicle: account.vehicle ?? false,
          gstApplicable: account.gstRate !== undefined,
          defaultGstRate: account.gstRate === undefined ? null : new Prisma.Decimal(account.gstRate),
          tallyName: account.name,
        },
      });
      accountIds.set(account.code, created.id);
    }

    for (const map of plan.categoryMaps) {
      const accountId = accountIds.get(map.code);
      if (accountId) await tx.finCategoryMap.create({ data: { category: map.category, accountId, updatedById: context.actorUserId } });
    }

    await writeFinAudit({ ...context, entityType: 'FinChartOfAccounts', entityId: 'default', action: 'INSTALL_DEFAULTS', after: summary }, tx);
    return summary;
  });
};

const assertGroupParent = async (tx: Prisma.TransactionClient, parentId: string | null, nature: FinAccountNature, selfId?: string) => {
  if (!parentId) return;
  const parent = await tx.finAccountGroup.findUnique({ where: { id: parentId } });
  if (!parent) throw badRequest('Parent group not found.');
  if (parent.nature !== nature) throw badRequest(`Parent group is ${parent.nature.toLowerCase()}; a group must keep its parent's nature.`);
  if (selfId) {
    let cursor: string | null = parent.id;
    while (cursor) {
      if (cursor === selfId) throw badRequest('A group cannot be moved under itself.');
      const next: { parentId: string | null } | null = await tx.finAccountGroup.findUnique({ where: { id: cursor }, select: { parentId: true } });
      cursor = next?.parentId ?? null;
    }
  }
};

export const createAccountGroup = async (body: Record<string, unknown>, context: ActorContext) => {
  const code = readCode(body, 'Group code');
  const parentId = readString(body, 'parentId', 'Parent group', { max: 60 });
  const data = {
    code,
    name: readString(body, 'name', 'Group name', { max: 120, required: true })!,
    nature: readEnum(body, 'nature', 'Nature', Object.values(FinAccountNature)),
    parentId,
    reportLine: readString(body, 'reportLine', 'Report line', { max: 80 }),
    sortOrder: readInt(body, 'sortOrder', 'Sort order', { min: 0, max: 9999 }) ?? 0,
  };
  return prisma.$transaction(async (tx) => {
    if (await tx.finAccountGroup.findUnique({ where: { code } })) throw conflict(`Group code ${code} is already used.`);
    if (await tx.finAccount.findUnique({ where: { code } })) throw conflict(`Code ${code} is already used by a ledger.`);
    await assertGroupParent(tx, parentId, data.nature);
    const group = await tx.finAccountGroup.create({ data });
    await writeFinAudit({ ...context, entityType: 'FinAccountGroup', entityId: group.id, action: 'CREATE', after: group }, tx);
    return group;
  });
};

export const updateAccountGroup = async (id: string, body: Record<string, unknown>, context: ActorContext) =>
  prisma.$transaction(async (tx) => {
    const before = await tx.finAccountGroup.findUnique({ where: { id } });
    if (!before) throw notFound('Account group not found.');
    const editable = onlyProvided(body, {
      name: readString({ name: before.name, ...body }, 'name', 'Group name', { max: 120, required: true })!,
      reportLine: readString(body, 'reportLine', 'Report line', { max: 80 }),
      sortOrder: readInt(body, 'sortOrder', 'Sort order', { min: 0, max: 9999 }) ?? 0,
      parentId: readString(body, 'parentId', 'Parent group', { max: 60 }),
    });
    if (before.isSystem && editable.parentId !== undefined && editable.parentId !== before.parentId) {
      throw badRequest('Built-in groups keep their position in the chart. Create a sub-group instead.');
    }
    if (editable.parentId !== undefined) await assertGroupParent(tx, editable.parentId ?? null, before.nature, id);
    const group = await tx.finAccountGroup.update({ where: { id }, data: editable });
    await writeFinAudit({ ...context, entityType: 'FinAccountGroup', entityId: id, action: 'UPDATE', before, after: group }, tx);
    return group;
  });

const readAccountFlags = (body: Record<string, unknown>) => {
  const gstApplicable = readBoolean(body, 'gstApplicable', false);
  const hsnSac = readString(body, 'hsnSac', 'HSN / SAC', { max: 10 });
  if (hsnSac && !/^[0-9]{4,8}$/.test(hsnSac)) throw badRequest('HSN / SAC must be 4 to 8 digits.');
  return {
    allowManualPosting: readBoolean(body, 'allowManualPosting', true),
    requiresParty: readBoolean(body, 'requiresParty', false),
    requiresVehicle: readBoolean(body, 'requiresVehicle', false),
    requiresCostCentre: readBoolean(body, 'requiresCostCentre', false),
    gstApplicable,
    defaultGstRate: gstApplicable ? readRate(body, 'defaultGstRate', 'Default GST rate') : null,
    hsnSac,
    tdsSection: readString(body, 'tdsSection', 'TDS section', { max: 10 })?.toUpperCase() ?? null,
    tallyName: readString(body, 'tallyName', 'Tally ledger name', { max: 120 }),
    description: readMultiline(body, 'description', 'Description', 500),
    isActive: readBoolean(body, 'isActive', true),
  };
};

export const createAccount = async (body: Record<string, unknown>, context: ActorContext) => {
  const code = readCode(body, 'Ledger code');
  const groupId = readString(body, 'groupId', 'Group', { max: 60, required: true })!;
  const kind = readEnum(body, 'kind', 'Ledger type', Object.values(FinAccountKind), 'GENERAL');
  if (BANK_MASTER_KINDS.includes(kind)) throw badRequest('Create bank, cash, wallet and gateway ledgers from Banking → Bank Accounts.');
  const flags = readAccountFlags(body);
  const name = readString(body, 'name', 'Ledger name', { max: 120, required: true })!;

  return prisma.$transaction(async (tx) => {
    const group = await tx.finAccountGroup.findUnique({ where: { id: groupId } });
    if (!group) throw badRequest('Group not found.');
    if (await tx.finAccount.findUnique({ where: { code } })) throw conflict(`Ledger code ${code} is already used.`);
    if (await tx.finAccountGroup.findUnique({ where: { code } })) throw conflict(`Code ${code} is already used by a group.`);
    const normalBalance = body.normalBalance
      ? readEnum(body, 'normalBalance', 'Normal balance', Object.values(FinBalanceSide))
      : defaultNormalBalance(group.nature);
    const account = await tx.finAccount.create({
      data: { code, name, groupId, kind, normalBalance, ...flags, tallyName: flags.tallyName ?? name },
    });
    await writeFinAudit({ ...context, entityType: 'FinAccount', entityId: account.id, action: 'CREATE', after: account }, tx);
    return account;
  });
};

export const updateAccount = async (id: string, body: Record<string, unknown>, context: ActorContext) =>
  prisma.$transaction(async (tx) => {
    const before = await tx.finAccount.findUnique({ where: { id }, include: { bankAccount: true } });
    if (!before) throw notFound('Ledger not found.');
    const flags = onlyProvided(body, readAccountFlags({ ...before, defaultGstRate: before.defaultGstRate?.toString() ?? null, ...body }));
    const data: Prisma.FinAccountUncheckedUpdateInput = { ...flags };
    if (flags.gstApplicable === false) data.defaultGstRate = null;

    if (body.name !== undefined) data.name = readString(body, 'name', 'Ledger name', { max: 120, required: true })!;
    if (body.groupId !== undefined && body.groupId !== before.groupId) {
      if (before.isSystem) throw badRequest('Built-in ledgers stay in their group so reports keep working.');
      const group = await tx.finAccountGroup.findUnique({ where: { id: String(body.groupId) } });
      if (!group) throw badRequest('Group not found.');
      const current = await tx.finAccountGroup.findUnique({ where: { id: before.groupId } });
      if (current && current.nature !== group.nature) throw badRequest('A ledger can only move to a group of the same nature.');
      data.groupId = group.id;
    }
    if (before.isSystem) {
      if (flags.isActive === false) throw badRequest('Built-in ledgers cannot be deactivated.');
      if (flags.allowManualPosting !== undefined && flags.allowManualPosting !== before.allowManualPosting) {
        throw badRequest('Manual posting rules of built-in ledgers are fixed.');
      }
    }
    if (before.bankAccount && flags.isActive !== undefined) {
      throw badRequest('Activate or deactivate this ledger from Banking → Bank Accounts.');
    }

    const account = await tx.finAccount.update({ where: { id }, data });
    await writeFinAudit({ ...context, entityType: 'FinAccount', entityId: id, action: 'UPDATE', before, after: account }, tx);
    return account;
  });

export const listCategoryMap = async () => {
  const [usage, maps] = await Promise.all([
    prisma.financeTransaction.groupBy({
      by: ['category'],
      where: { status: { not: FinanceTransactionStatus.VOIDED } },
      _count: { _all: true },
    }),
    prisma.finCategoryMap.findMany({ include: { account: { select: { id: true, code: true, name: true } } } }),
  ]);
  const categories = new Set([...Object.keys(DEFAULT_CATEGORY_MAP), ...usage.map((row) => row.category), ...maps.map((map) => map.category)]);
  return Array.from(categories).sort().map((category) => {
    const map = maps.find((item) => item.category === category);
    return {
      category,
      transactionCount: usage.find((row) => row.category === category)?._count._all ?? 0,
      accountId: map?.accountId ?? null,
      account: map?.account ?? null,
    };
  });
};

export const updateCategoryMap = async (body: Record<string, unknown>, context: ActorContext) => {
  const items = Array.isArray(body.items) ? body.items : null;
  if (!items || items.length > 500) throw badRequest('Send up to 500 category mappings.');
  const parsed = items.map((item) => {
    const row = (item || {}) as Record<string, unknown>;
    return {
      category: readString(row, 'category', 'Category', { max: 80, required: true })!,
      accountId: readString(row, 'accountId', 'Ledger', { max: 60 }),
    };
  });

  return prisma.$transaction(async (tx) => {
    const accountIds = parsed.flatMap((item) => (item.accountId ? [item.accountId] : []));
    const accounts = await tx.finAccount.findMany({ where: { id: { in: accountIds } }, select: { id: true, isActive: true } });
    if (accounts.length !== new Set(accountIds).size) throw badRequest('One of the selected ledgers was not found.');
    if (accounts.some((account) => !account.isActive)) throw badRequest('Inactive ledgers cannot be mapped.');
    const before = await tx.finCategoryMap.findMany();
    for (const item of parsed) {
      if (item.accountId) {
        await tx.finCategoryMap.upsert({
          where: { category: item.category },
          create: { category: item.category, accountId: item.accountId, updatedById: context.actorUserId },
          update: { accountId: item.accountId, updatedById: context.actorUserId },
        });
      } else {
        await tx.finCategoryMap.deleteMany({ where: { category: item.category } });
      }
    }
    await writeFinAudit({ ...context, entityType: 'FinCategoryMap', entityId: 'all', action: 'UPDATE', before, after: parsed }, tx);
    return { updated: parsed.length };
  });
};

// Where each existing payment method lands when automatic posting starts (phase P3).
export const PAYMENT_METHOD_SOURCES = [
  { source: 'SELL_ACCOUNT_PAYMENT', label: 'Sold Vehicles payments', methods: ['CASH', 'UPI', 'BANK_TRANSFER', 'CHEQUE', 'OTHER'] },
  { source: 'LISTING_PAYMENT', label: 'Listing payments', methods: ['RTGS', 'RAZORPAY', 'PHONEPE'] },
  { source: 'CUSTOMER_PRIME', label: 'Customer Prime', methods: ['UPI'] },
  { source: 'PARTNER_DEPOSIT', label: 'Partner deposits', methods: ['ONLINE_PAYMENT', 'UPI_PAYMENT', 'NET_BANKING', 'BANK_TRANSFER', 'CASH', 'CHEQUE', 'DEMAND_DRAFT'] },
] as const;

const SUGGESTED_SYSTEM_KEY: Record<string, string> = { CASH: 'CASH_IN_HAND', RAZORPAY: 'GATEWAY_RAZORPAY', PHONEPE: 'GATEWAY_PHONEPE' };

type PaymentMethodMap = Record<string, Record<string, string | null>>;

const readConfig = (config: Prisma.JsonValue | null | undefined) =>
  (config && typeof config === 'object' && !Array.isArray(config) ? config : {}) as Record<string, unknown>;

export const getPaymentMethodMap = async () => {
  const [settings, accounts] = await Promise.all([
    prisma.finSettings.findUnique({ where: { id: FIN_SETTINGS_ID } }),
    prisma.finAccount.findMany({ where: { kind: { in: BANK_MASTER_KINDS } }, select: { id: true, code: true, name: true, systemKey: true, isActive: true } }),
  ]);
  const saved = (readConfig(settings?.config).paymentMethodAccounts || {}) as PaymentMethodMap;
  return {
    accounts,
    sources: PAYMENT_METHOD_SOURCES.map((source) => ({
      source: source.source,
      label: source.label,
      methods: source.methods.map((method) => ({
        method,
        accountId: saved[source.source]?.[method] ?? null,
        suggestedAccountId: accounts.find((account) => account.systemKey === SUGGESTED_SYSTEM_KEY[method])?.id ?? null,
      })),
    })),
  };
};

export const updatePaymentMethodMap = async (body: Record<string, unknown>, context: ActorContext) => {
  const input = body.map && typeof body.map === 'object' ? (body.map as Record<string, Record<string, unknown>>) : null;
  if (!input) throw badRequest('Payment method map is required.');
  const next: PaymentMethodMap = {};
  const accountIds = new Set<string>();
  for (const source of PAYMENT_METHOD_SOURCES) {
    next[source.source] = {};
    for (const method of source.methods) {
      const value = input[source.source]?.[method];
      const accountId = typeof value === 'string' && value ? value : null;
      next[source.source]![method] = accountId;
      if (accountId) accountIds.add(accountId);
    }
  }

  await prisma.$transaction(async (tx) => {
    const accounts = await tx.finAccount.findMany({ where: { id: { in: Array.from(accountIds) } }, select: { id: true, kind: true, isActive: true } });
    if (accounts.length !== accountIds.size) throw badRequest('One of the selected accounts was not found.');
    if (accounts.some((account) => !BANK_MASTER_KINDS.includes(account.kind) || !account.isActive)) {
      throw badRequest('Payment methods can only map to an active bank, cash, wallet or gateway account.');
    }
    const settings = await tx.finSettings.findUnique({ where: { id: FIN_SETTINGS_ID } });
    const config = { ...readConfig(settings?.config), paymentMethodAccounts: next } as Prisma.InputJsonValue;
    await tx.finSettings.upsert({
      where: { id: FIN_SETTINGS_ID },
      create: { id: FIN_SETTINGS_ID, config, updatedById: context.actorUserId },
      update: { config, updatedById: context.actorUserId },
    });
    await writeFinAudit({ ...context, entityType: 'FinSettings', entityId: FIN_SETTINGS_ID, action: 'UPDATE_PAYMENT_METHOD_MAP', before: readConfig(settings?.config).paymentMethodAccounts ?? null, after: next }, tx);
  });
  return getPaymentMethodMap();
};
