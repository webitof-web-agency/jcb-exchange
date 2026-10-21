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
