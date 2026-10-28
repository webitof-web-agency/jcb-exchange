import { FinPostingMode, Prisma } from '@prisma/client';
import prisma from '../../../lib/prisma';
import { parseFinanceDate } from '../../../utils/finance';
import { parseMoneyValue, roundMoney } from '../utils/money';
import { writeFinAudit } from './audit.service';
import { FinanceHubSchemaMissingError, isFinanceHubSchemaMissing } from './schemaState';

export const FIN_SETTINGS_ID = 'default';

// Sec 40A(3) cash payment and Sec 269ST cash receipt limits; editable because the law changes.
export const DEFAULT_CASH_LIMIT_PER_VOUCHER = 10000;
export const DEFAULT_CASH_RECEIPT_LIMIT = 200000;

type SettingsRecord = {
  postingMode: FinPostingMode;
  config?: Prisma.JsonValue | null;
  baseCurrency: string;
  booksBeginDate: Date | null;
  cashLimitPerVoucher: Prisma.Decimal | null;
  cashReceiptLimit: Prisma.Decimal | null;
  updatedById: string | null;
  updatedAt: Date | null;
};

const DEFAULT_SETTINGS: SettingsRecord = {
  postingMode: FinPostingMode.OFF,
  baseCurrency: 'INR',
  booksBeginDate: null,
  cashLimitPerVoucher: new Prisma.Decimal(DEFAULT_CASH_LIMIT_PER_VOUCHER),
  cashReceiptLimit: new Prisma.Decimal(DEFAULT_CASH_RECEIPT_LIMIT),
  updatedById: null,
  updatedAt: null,
};

const configObject = (config: Prisma.JsonValue | null | undefined) =>
  (config && typeof config === 'object' && !Array.isArray(config) ? config : {}) as Record<string, unknown>;

/** Maker-checker policy for manual vouchers, kept in FinSettings.config.approval. */
export const readApprovalPolicy = (config: Prisma.JsonValue | null | undefined) => {
  const approval = configObject(config).approval as { threshold?: unknown; cashRequiresApproval?: unknown } | undefined;
  const threshold = approval?.threshold === null || approval?.threshold === undefined ? null : parseMoneyValue(String(approval.threshold));
  return { threshold: threshold && threshold.greaterThan(0) ? threshold : null, cashRequiresApproval: approval?.cashRequiresApproval === true };
};

export const serializeFinSettings = (record: SettingsRecord, persisted: boolean) => ({
  postingMode: record.postingMode,
  approval: (() => {
    const policy = readApprovalPolicy(record.config);
    return { threshold: policy.threshold ? policy.threshold.toNumber() : null, cashRequiresApproval: policy.cashRequiresApproval };
  })(),
  baseCurrency: record.baseCurrency,
  booksBeginDate: record.booksBeginDate ? record.booksBeginDate.toISOString().slice(0, 10) : null,
  cashLimitPerVoucher: record.cashLimitPerVoucher === null ? null : record.cashLimitPerVoucher.toNumber(),
  cashReceiptLimit: record.cashReceiptLimit === null ? null : record.cashReceiptLimit.toNumber(),
  updatedById: record.updatedById,
  updatedAt: record.updatedAt ? record.updatedAt.toISOString() : null,
  persisted,
});

/** Reads settings without creating the row, so a GET never writes. */
export const loadFinSettings = async () => {
  try {
    const record = await prisma.finSettings.findUnique({ where: { id: FIN_SETTINGS_ID } });
    return record ? serializeFinSettings(record, true) : serializeFinSettings(DEFAULT_SETTINGS, false);
  } catch (error) {
    if (isFinanceHubSchemaMissing(error)) throw new FinanceHubSchemaMissingError();
    throw error;
  }
};

type SettingsUpdate = {
  approval?: { threshold: string | null; cashRequiresApproval: boolean };
  booksBeginDate?: Date | null;
  cashLimitPerVoucher?: Prisma.Decimal | null;
  cashReceiptLimit?: Prisma.Decimal | null;
};

const optionalLimit = (value: unknown, label: string): Prisma.Decimal | null | string => {
  if (value === null || value === '') return null;
  const parsed = parseMoneyValue(value as string | number);
  if (!parsed || parsed.isNegative()) return `${label} must be zero or a positive amount.`;
  if (parsed.greaterThan('999999999999.99')) return `${label} is too large.`;
  return roundMoney(parsed);
};

/**
 * Validates the editable settings. postingMode is intentionally not editable here: it only
 * becomes switchable once the posting worker ships (phase P3), and then only for super admins.
 */
export const buildFinSettingsUpdate = (body: Record<string, unknown>): { data: SettingsUpdate } | { error: string } => {
  const data: SettingsUpdate = {};

  if (body.postingMode !== undefined) {
    return { error: 'Posting mode cannot be changed yet. It becomes available with automatic ledger posting.' };
  }

  if (body.booksBeginDate !== undefined) {
    if (body.booksBeginDate === null || body.booksBeginDate === '') {
      data.booksBeginDate = null;
    } else {
      const date = parseFinanceDate(body.booksBeginDate);
      if (!date) return { error: 'Books begin date is invalid.' };
      data.booksBeginDate = date;
    }
  }

  for (const [key, label] of [
    ['cashLimitPerVoucher', 'Cash payment limit'],
    ['cashReceiptLimit', 'Cash receipt limit'],
  ] as const) {
    if (body[key] === undefined) continue;
    const parsed = optionalLimit(body[key], label);
    if (typeof parsed === 'string') return { error: parsed };
    data[key] = parsed;
  }

  if (body.approvalThreshold !== undefined || body.cashRequiresApproval !== undefined) {
    const threshold = body.approvalThreshold === undefined ? undefined : optionalLimit(body.approvalThreshold, 'Approval threshold');
    if (typeof threshold === 'string') return { error: threshold };
    if (body.cashRequiresApproval !== undefined && typeof body.cashRequiresApproval !== 'boolean') {
      return { error: 'cashRequiresApproval must be true or false.' };
    }
    data.approval = {
      threshold: threshold === undefined ? null : threshold === null || threshold.isZero() ? null : threshold.toFixed(2),
      cashRequiresApproval: body.cashRequiresApproval === true,
    };
  }

  if (!Object.keys(data).length) return { error: 'Nothing to update.' };
  return { data };
};

export const updateFinSettings = async (
  data: SettingsUpdate,
  context: { actorUserId: string | null; ipAddress: string | null; userAgent: string | null; reason?: string | null },
) => {
  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.finSettings.findUnique({ where: { id: FIN_SETTINGS_ID } });
      const { approval, ...columns } = data;
      const config = approval
        ? ({ ...configObject(existing?.config), approval } as Prisma.InputJsonValue)
        : undefined;
      const record = await tx.finSettings.upsert({
        where: { id: FIN_SETTINGS_ID },
        create: {
          id: FIN_SETTINGS_ID,
          cashLimitPerVoucher: DEFAULT_SETTINGS.cashLimitPerVoucher,
          cashReceiptLimit: DEFAULT_SETTINGS.cashReceiptLimit,
          ...columns,
          ...(config ? { config } : {}),
          updatedById: context.actorUserId,
        },
        update: { ...columns, ...(config ? { config } : {}), updatedById: context.actorUserId },
      });
      await writeFinAudit({
        ...context,
        entityType: 'FinSettings',
        entityId: FIN_SETTINGS_ID,
        action: existing ? 'UPDATE' : 'CREATE',
        before: existing ? serializeFinSettings(existing, true) : null,
        after: serializeFinSettings(record, true),
      }, tx);
      return serializeFinSettings(record, true);
    });
  } catch (error) {
    if (isFinanceHubSchemaMissing(error)) throw new FinanceHubSchemaMissingError();
    throw error;
  }
};

// ---------------------------------------------------------------------------
// Automatic posting (P3). User choices live in config.posting (read-modify-write by admins);
// worker progress lives in config.postingState and is only written by the worker.
// ---------------------------------------------------------------------------

export const POSTING_SOURCES = ['SELL_ACCOUNT', 'LISTING_PAYMENT', 'CUSTOMER_PRIME', 'PARTNER_DEPOSIT', 'API_WALLET', 'FINANCE_TRANSACTION'] as const;
/**
 * Sources that stay off until switched on. Empty: Expenses-page entries post by default (only manual
 * entries; imported statement lines are matched in Bank Reconciliation instead), and the page shows
 * each entry's book status so paid expenses are not entered again as bills or vouchers.
 */
const OFF_BY_DEFAULT: readonly string[] = [];
export type PostingSource = (typeof POSTING_SOURCES)[number];

export type PostingConfig = {
  sources: Record<PostingSource, boolean>;
  /** Sold Vehicle form costs (transport, paperwork, RTO, other) go into the vehicle's stock cost. */
  capitaliseVehicleCosts: boolean;
};

export const readPostingConfig = (config: Prisma.JsonValue | null | undefined): PostingConfig => {
  const posting = (configObject(config).posting ?? {}) as { sources?: Record<string, unknown>; capitaliseVehicleCosts?: unknown };
  return {
    sources: Object.fromEntries(POSTING_SOURCES.map((source) => [source, OFF_BY_DEFAULT.includes(source) ? posting.sources?.[source] === true : posting.sources?.[source] !== false])) as Record<PostingSource, boolean>,
    capitaliseVehicleCosts: posting.capitaliseVehicleCosts !== false,
  };
};

export type PostingState = {
  lastSweepAt: string | null;
  lastRunAt: string | null;
  lastRunSummary: Record<string, unknown> | null;
};

export const readPostingState = (config: Prisma.JsonValue | null | undefined): PostingState => {
  const state = (configObject(config).postingState ?? {}) as Partial<PostingState>;
  return { lastSweepAt: state.lastSweepAt ?? null, lastRunAt: state.lastRunAt ?? null, lastRunSummary: state.lastRunSummary ?? null };
};

/** Atomic JSON update so the worker never overwrites an admin's concurrent settings change. */
export const writePostingState = async (state: PostingState) => {
  const value = JSON.stringify(state);
  await prisma.$executeRaw`
    INSERT INTO "FinSettings" ("id", "config", "updatedAt") VALUES (${FIN_SETTINGS_ID}, jsonb_build_object('postingState', ${value}::jsonb), NOW())
    ON CONFLICT ("id") DO UPDATE SET "config" = jsonb_set(COALESCE("FinSettings"."config", '{}'::jsonb), '{postingState}', ${value}::jsonb, true)`;
};

export const buildPostingSettingsUpdate = (body: Record<string, unknown>) => {
  const mode = body.postingMode === undefined ? undefined : String(body.postingMode);
  if (mode !== undefined && !(Object.values(FinPostingMode) as string[]).includes(mode)) return { error: 'Posting mode is invalid.' } as const;
  let sources: Partial<Record<PostingSource, boolean>> | undefined;
  if (body.sources !== undefined) {
    if (!body.sources || typeof body.sources !== 'object') return { error: 'Sources must be an object.' } as const;
    sources = {};
    for (const [key, value] of Object.entries(body.sources as Record<string, unknown>)) {
      if (!(POSTING_SOURCES as readonly string[]).includes(key) || typeof value !== 'boolean') return { error: `Invalid source setting ${key}.` } as const;
      sources[key as PostingSource] = value;
    }
  }
  if (body.capitaliseVehicleCosts !== undefined && typeof body.capitaliseVehicleCosts !== 'boolean') {
    return { error: 'capitaliseVehicleCosts must be true or false.' } as const;
  }
  const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) : '';
  return {
    data: {
      postingMode: mode as FinPostingMode | undefined,
      sources,
      capitaliseVehicleCosts: body.capitaliseVehicleCosts as boolean | undefined,
      reason: reason || null,
    },
  } as const;
};

export const updatePostingSettings = async (
  input: { postingMode?: FinPostingMode | undefined; sources?: Partial<Record<PostingSource, boolean>> | undefined; capitaliseVehicleCosts?: boolean | undefined; reason: string | null },
  context: { actorUserId: string | null; ipAddress: string | null; userAgent: string | null },
) => {
  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM "FinSettings" WHERE id = ${FIN_SETTINGS_ID} FOR UPDATE`;
      const existing = await tx.finSettings.findUnique({ where: { id: FIN_SETTINGS_ID } });
      const before = { mode: existing?.postingMode ?? 'OFF', ...readPostingConfig(existing?.config) };
      const current = readPostingConfig(existing?.config);
      const posting = {
        sources: { ...current.sources, ...(input.sources ?? {}) },
        capitaliseVehicleCosts: input.capitaliseVehicleCosts ?? current.capitaliseVehicleCosts,
      };
      const config = { ...configObject(existing?.config), posting } as Prisma.InputJsonValue;
      const record = await tx.finSettings.upsert({
        where: { id: FIN_SETTINGS_ID },
        create: {
          id: FIN_SETTINGS_ID,
          cashLimitPerVoucher: DEFAULT_SETTINGS.cashLimitPerVoucher,
          cashReceiptLimit: DEFAULT_SETTINGS.cashReceiptLimit,
          config,
          ...(input.postingMode ? { postingMode: input.postingMode } : {}),
          updatedById: context.actorUserId,
        },
        update: { config, ...(input.postingMode ? { postingMode: input.postingMode } : {}), updatedById: context.actorUserId },
      });
      await writeFinAudit({
        ...context,
        entityType: 'FinSettings',
        entityId: FIN_SETTINGS_ID,
        action: input.postingMode && input.postingMode !== before.mode ? `POSTING_MODE_${input.postingMode}` : 'UPDATE_POSTING_SETTINGS',
        before,
        after: { mode: record.postingMode, ...posting },
        reason: input.reason,
      }, tx);
      return { postingMode: record.postingMode, ...posting };
    });
  } catch (error) {
    if (isFinanceHubSchemaMissing(error)) throw new FinanceHubSchemaMissingError();
    throw error;
  }
};
