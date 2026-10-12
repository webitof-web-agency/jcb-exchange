import crypto from 'node:crypto';
import prisma from '../lib/prisma';

export const PLATFORM_API_WALLET_ID = 'platform';

export const API_BILLABLE_SERVICES = [
  { serviceKey: 'PAN_VERIFICATION', displayName: 'PAN Verification' },
  { serviceKey: 'GST_VERIFICATION', displayName: 'GST Verification' },
  { serviceKey: 'MOBILE_TO_PAN', displayName: 'Mobile To PAN' },
  { serviceKey: 'DRIVING_LICENSE_VERIFICATION', displayName: 'Driving License Verification' },
  { serviceKey: 'RC_OWNER_HISTORY', displayName: 'RC Owner History' },
  { serviceKey: 'RC_CHALLAN', displayName: 'RC Challan' },
  { serviceKey: 'CHASSIS_TO_RC', displayName: 'Chassis to RC Details' },
  { serviceKey: 'RC_TO_MOBILE', displayName: 'RC to Mobile' },
  { serviceKey: 'MOBILE_TO_RC', displayName: 'Mobile To RC' },
  { serviceKey: 'RC_MOBILE_NUMBER_CHECK', displayName: 'RC Mobile Number Check' },
] as const;

export type ApiBillableServiceKey = (typeof API_BILLABLE_SERVICES)[number]['serviceKey'];
export type ApiBillingMode = 'DISABLED' | 'ACTIVE';

const SERVICE_KEYS = new Set<string>(API_BILLABLE_SERVICES.map((service) => service.serviceKey));
const RUPEE_AMOUNT_PATTERN = /^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/;
const MAX_PAISE = 1_000_000_000;
const WEBHOOK_MAX_AGE_MS = 5 * 60 * 1000;

type RawWallet = {
  id: string;
  currency: string;
  balancePaise: number;
  mode: ApiBillingMode;
};

type RawPrice = {
  serviceKey: ApiBillableServiceKey;
  amountPaise: number;
  active: boolean;
  version: number;
};

type WalletRow = { balancePaise: number };

export type ApiBillingSummary = {
  wallet: {
    currency: 'INR';
    balanceRupees: string;
    mode: ApiBillingMode;
  };
  services: Array<{
    serviceKey: ApiBillableServiceKey;
    displayName: string;
    priceRupees: string | null;
    active: boolean;
    version: number | null;
  }>;
};

export type ApiWalletChargeResult = {
  charged: boolean;
  billingMode: ApiBillingMode;
  amountPaise: number;
  amountRupees: string;
  balanceRupees: string;
  serviceKey: ApiBillableServiceKey;
  usageId?: string;
};

export type ApiBillingGateway = {
  chargeForProviderCall: (input: {
    serviceKey: ApiBillableServiceKey;
    verificationRecordId: string;
    requestedById: string;
    providerAttemptId?: string;
  }) => Promise<ApiWalletChargeResult>;
};

export class ApiWalletBillingError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code: 'billing_price_not_configured' | 'wallet_insufficient_balance' | 'billing_webhook_invalid' | 'billing_webhook_unauthorized',
  ) {
    super(message);
    this.name = 'ApiWalletBillingError';
  }
}

export const isApiWalletBillingError = (error: unknown): error is ApiWalletBillingError =>
  error instanceof ApiWalletBillingError;

export const rupeesToPaise = (value: unknown): number => {
  if (typeof value !== 'string') {
    throw new ApiWalletBillingError('Amount must be a rupee value with up to two decimal places.', 400, 'billing_webhook_invalid');
  }

  const normalized = value.trim();
  const match = RUPEE_AMOUNT_PATTERN.exec(normalized);
  if (!match) {
    throw new ApiWalletBillingError('Amount must be a non-negative rupee value with up to two decimal places.', 400, 'billing_webhook_invalid');
  }

  const rupees = Number.parseInt(match[1] || '0', 10);
  const paisePart = (match[2] || '').padEnd(2, '0');
  const paise = (rupees * 100) + Number.parseInt(paisePart || '0', 10);
  if (!Number.isSafeInteger(paise) || paise > MAX_PAISE) {
    throw new ApiWalletBillingError('Amount is outside the supported range.', 400, 'billing_webhook_invalid');
  }
  return paise;
};

export const formatRupeesFromPaise = (paise: number): string => {
  if (!Number.isSafeInteger(paise) || paise < 0) {
    throw new Error('Paise amount must be a non-negative safe integer.');
  }
  return `${Math.floor(paise / 100)}.${String(paise % 100).padStart(2, '0')}`;
};

export const createApiBillingWebhookSignature = (rawBody: Buffer, secret: string): string =>
  `sha256=${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}`;

export const verifyApiBillingWebhookSignature = (rawBody: Buffer, signature: unknown, secret: string | undefined): boolean => {
  if (typeof signature !== 'string' || !secret?.trim()) return false;
  const expected = createApiBillingWebhookSignature(rawBody, secret.trim());
  const receivedBuffer = Buffer.from(signature, 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');
  return receivedBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(receivedBuffer, expectedBuffer);
};

const asObject = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;

const requiredString = (value: unknown, name: string, maxLength: number): string => {
  if (typeof value !== 'string') {
    throw new ApiWalletBillingError(`${name} is required.`, 400, 'billing_webhook_invalid');
  }
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength || /[\u0000-\u001F\u007F]/.test(normalized)) {
    throw new ApiWalletBillingError(`${name} is invalid.`, 400, 'billing_webhook_invalid');
  }
  return normalized;
};

const parseOccurredAt = (value: unknown): Date => {
  const raw = requiredString(value, 'occurredAt', 40);
  const date = new Date(raw);
  if (Number.isNaN(date.getTime()) || Math.abs(Date.now() - date.getTime()) > WEBHOOK_MAX_AGE_MS) {
    throw new ApiWalletBillingError('Webhook timestamp is invalid or expired.', 400, 'billing_webhook_invalid');
  }
  return date;
};

const parseServiceKey = (value: unknown): ApiBillableServiceKey => {
  const serviceKey = requiredString(value, 'serviceKey', 80);
  if (!SERVICE_KEYS.has(serviceKey)) {
    throw new ApiWalletBillingError('serviceKey is not supported.', 400, 'billing_webhook_invalid');
  }
  return serviceKey as ApiBillableServiceKey;
};

const parseBoolean = (value: unknown, name: string, fallback: boolean): boolean => {
  if (value === undefined) return fallback;
  if (typeof value !== 'boolean') {
    throw new ApiWalletBillingError(`${name} must be true or false.`, 400, 'billing_webhook_invalid');
  }
  return value;
};

const serializeSummary = (wallet: RawWallet, prices: RawPrice[]): ApiBillingSummary => {
  const byKey = new Map(prices.map((price) => [price.serviceKey, price]));
  return {
    wallet: {
      currency: 'INR',
      balanceRupees: formatRupeesFromPaise(wallet.balancePaise),
      mode: wallet.mode,
    },
    services: API_BILLABLE_SERVICES.map((service) => {
      const price = byKey.get(service.serviceKey);
      return {
        serviceKey: service.serviceKey,
        displayName: service.displayName,
        priceRupees: price?.active && price.amountPaise > 0 ? formatRupeesFromPaise(price.amountPaise) : null,
        active: Boolean(price?.active && price.amountPaise > 0),
        version: price?.version ?? null,
      };
    }),
  };
};

const isUniqueConstraintError = (error: unknown) =>
  Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?: unknown }).code === 'P2002');

export class ApiWalletBillingService implements ApiBillingGateway {
  private readonly db: any;

  constructor(database: unknown = prisma) {
    this.db = database as any;
  }

  private async ensureWallet(database = this.db): Promise<RawWallet> {
    return database.apiWallet.upsert({
      where: { id: PLATFORM_API_WALLET_ID },
      update: {},
      create: {
        id: PLATFORM_API_WALLET_ID,
        currency: 'INR',
        balancePaise: 0,
        mode: 'DISABLED',
      },
    });
  }

  async getSummary(): Promise<ApiBillingSummary> {
    const wallet = await this.ensureWallet();
    const prices = await this.db.apiServicePrice.findMany({
      where: { serviceKey: { in: API_BILLABLE_SERVICES.map((service) => service.serviceKey) } },
    });
    return serializeSummary(wallet, prices);
  }

  async chargeForProviderCall(input: {
    serviceKey: ApiBillableServiceKey;
    verificationRecordId: string;
    requestedById: string;
    providerAttemptId?: string;
  }): Promise<ApiWalletChargeResult> {
    const verificationRecordId = requiredString(input.verificationRecordId, 'verificationRecordId', 100);
    const requestedById = requiredString(input.requestedById, 'requestedById', 100);
    const providerAttemptId = input.providerAttemptId
      ? requiredString(input.providerAttemptId, 'providerAttemptId', 100)
      : crypto.randomUUID();

    await this.ensureWallet();

    try {
      return await this.db.$transaction(async (tx: any) => {
        const wallet = await tx.apiWallet.findUnique({ where: { id: PLATFORM_API_WALLET_ID } }) as RawWallet | null;
        if (!wallet) throw new Error('Platform API wallet is unavailable.');

        if (wallet.mode !== 'ACTIVE') {
          return {
            charged: false,
            billingMode: wallet.mode,
            amountPaise: 0,
            amountRupees: '0.00',
            balanceRupees: formatRupeesFromPaise(wallet.balancePaise),
            serviceKey: input.serviceKey,
          };
        }

        const price = await tx.apiServicePrice.findUnique({ where: { serviceKey: input.serviceKey } }) as RawPrice | null;
        if (!price?.active || price.amountPaise <= 0) {
          throw new ApiWalletBillingError(
            `A live price is required for ${input.serviceKey} before an external provider request can be made.`,
            503,
            'billing_price_not_configured',
          );
        }

        const rows = await tx.$queryRaw<WalletRow[]>`
          UPDATE "ApiWallet"
          SET "balancePaise" = "balancePaise" - ${price.amountPaise},
              "updatedAt" = CURRENT_TIMESTAMP
          WHERE "id" = ${PLATFORM_API_WALLET_ID}
            AND "mode" = 'ACTIVE'
            AND "balancePaise" >= ${price.amountPaise}
          RETURNING "balancePaise"
        `;
        const balanceAfterPaise = rows[0]?.balancePaise;
        if (!Number.isSafeInteger(balanceAfterPaise)) {
          const currentWallet = await tx.apiWallet.findUnique({ where: { id: PLATFORM_API_WALLET_ID } }) as RawWallet | null;
          if (currentWallet?.mode !== 'ACTIVE') {
            return {
              charged: false,
              billingMode: currentWallet?.mode || 'DISABLED',
              amountPaise: 0,
              amountRupees: '0.00',
              balanceRupees: formatRupeesFromPaise(currentWallet?.balancePaise || 0),
              serviceKey: input.serviceKey,
            };
          }
          throw new ApiWalletBillingError(
            `Wallet balance is insufficient. Required ₹${formatRupeesFromPaise(price.amountPaise)}, available ₹${formatRupeesFromPaise(currentWallet?.balancePaise || 0)}.`,
            402,
            'wallet_insufficient_balance',
          );
        }

        const usage = await tx.apiUsageRecord.create({
          data: {
            walletId: PLATFORM_API_WALLET_ID,
            serviceKey: input.serviceKey,
            verificationRecordId,
            providerAttemptId,
            requestedById,
            amountPaise: price.amountPaise,
            priceVersion: price.version,
            currency: 'INR',
          },
        });

        await tx.apiWalletLedger.create({
          data: {
            walletId: PLATFORM_API_WALLET_ID,
            type: 'DEBIT',
            amountPaise: price.amountPaise,
            balanceBeforePaise: balanceAfterPaise + price.amountPaise,
            balanceAfterPaise,
            serviceKey: input.serviceKey,
            usageId: usage.id,
            idempotencyKey: `provider:${providerAttemptId}`,
            requestedById,
            metadata: { verificationRecordId, priceVersion: price.version },
          },
        });

        return {
          charged: true,
          billingMode: 'ACTIVE' as const,
          amountPaise: price.amountPaise,
          amountRupees: formatRupeesFromPaise(price.amountPaise),
          balanceRupees: formatRupeesFromPaise(balanceAfterPaise),
          serviceKey: input.serviceKey,
          usageId: usage.id,
        };
      });
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;

      const existing = await this.db.apiUsageRecord.findUnique({
        where: { providerAttemptId },
        include: { ledger: true },
      });
      if (!existing?.ledger) throw error;
      return {
        charged: true,
        billingMode: 'ACTIVE',
        amountPaise: existing.amountPaise,
        amountRupees: formatRupeesFromPaise(existing.amountPaise),
        balanceRupees: formatRupeesFromPaise(existing.ledger.balanceAfterPaise),
        serviceKey: existing.serviceKey as ApiBillableServiceKey,
        usageId: existing.id,
      };
    }
  }

  async processSignedWebhook(rawBody: Buffer): Promise<{ duplicate: boolean; summary: ApiBillingSummary }> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody.toString('utf8'));
    } catch {
      throw new ApiWalletBillingError('Webhook body must be valid JSON.', 400, 'billing_webhook_invalid');
    }

    const payload = asObject(parsed);
    if (!payload) throw new ApiWalletBillingError('Webhook payload must be an object.', 400, 'billing_webhook_invalid');
    const eventId = requiredString(payload.eventId, 'eventId', 150);
    const eventType = requiredString(payload.eventType, 'eventType', 40);
    const occurredAt = parseOccurredAt(payload.occurredAt);
    const data = asObject(payload.data);
    if (!data) throw new ApiWalletBillingError('data is required.', 400, 'billing_webhook_invalid');
    const checksum = crypto.createHash('sha256').update(rawBody).digest('hex');

    await this.ensureWallet();

    try {
      return await this.db.$transaction(async (tx: any) => {
        const existingEvent = await tx.apiBillingWebhookEvent.findUnique({ where: { eventId } });
        if (existingEvent) {
          const summary = await this.getSummaryWithinTransaction(tx);
          return { duplicate: true, summary };
        }

        if (eventType === 'WALLET_CREDIT') {
          const amountPaise = rupeesToPaise(data.amountRupees);
          if (amountPaise <= 0) {
            throw new ApiWalletBillingError('amountRupees must be greater than zero for a wallet credit.', 400, 'billing_webhook_invalid');
          }
          const externalTransactionId = requiredString(data.externalTransactionId, 'externalTransactionId', 150);
          const activateBilling = parseBoolean(data.activateBilling, 'activateBilling', false);
          const existingLedger = await tx.apiWalletLedger.findUnique({ where: { externalTransactionId } });
          let balanceAfterPaise: number;
          if (existingLedger) {
            balanceAfterPaise = existingLedger.balanceAfterPaise;
          } else {
            const rows = await tx.$queryRaw<WalletRow[]>`
              UPDATE "ApiWallet"
              SET "balancePaise" = "balancePaise" + ${amountPaise},
                  "mode" = CASE WHEN ${activateBilling} THEN 'ACTIVE'::"ApiBillingMode" ELSE "mode" END,
                  "updatedAt" = CURRENT_TIMESTAMP
              WHERE "id" = ${PLATFORM_API_WALLET_ID}
              RETURNING "balancePaise"
            `;
            balanceAfterPaise = rows[0]?.balancePaise ?? 0;
            await tx.apiWalletLedger.create({
              data: {
                walletId: PLATFORM_API_WALLET_ID,
                type: 'CREDIT',
                amountPaise,
                balanceBeforePaise: balanceAfterPaise - amountPaise,
                balanceAfterPaise,
                externalTransactionId,
                idempotencyKey: `credit:${externalTransactionId}`,
                metadata: { eventId, source: 'EXTERNAL_WEBHOOK' },
              },
            });
          }
        } else if (eventType === 'SERVICE_PRICE_SET') {
          const serviceKey = parseServiceKey(data.serviceKey);
          const amountPaise = rupeesToPaise(data.priceRupees);
          if (amountPaise <= 0) {
            throw new ApiWalletBillingError('priceRupees must be greater than zero.', 400, 'billing_webhook_invalid');
          }
          const active = parseBoolean(data.active, 'active', true);
          await tx.apiServicePrice.upsert({
            where: { serviceKey },
            create: { serviceKey, amountPaise, active, version: 1, updatedBySource: 'EXTERNAL_WEBHOOK' },
            update: { amountPaise, active, version: { increment: 1 }, updatedBySource: 'EXTERNAL_WEBHOOK' },
          });
        } else if (eventType === 'WALLET_MODE_SET') {
          const mode = requiredString(data.mode, 'mode', 10);
          if (mode !== 'ACTIVE' && mode !== 'DISABLED') {
            throw new ApiWalletBillingError('mode must be ACTIVE or DISABLED.', 400, 'billing_webhook_invalid');
          }
          await tx.apiWallet.update({ where: { id: PLATFORM_API_WALLET_ID }, data: { mode } });
        } else {
          throw new ApiWalletBillingError('eventType is not supported.', 400, 'billing_webhook_invalid');
        }

        const summary = await this.getSummaryWithinTransaction(tx);
        await tx.apiBillingWebhookEvent.create({
          data: {
            eventId,
            eventType,
            occurredAt,
            payloadChecksum: checksum,
            status: 'PROCESSED',
            processedAt: new Date(),
            outcome: { wallet: summary.wallet, eventType },
          },
        });
        return { duplicate: false, summary };
      });
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      const summary = await this.getSummary();
      return { duplicate: true, summary };
    }
  }

  private async getSummaryWithinTransaction(tx: any): Promise<ApiBillingSummary> {
    const [wallet, prices] = await Promise.all([
      tx.apiWallet.findUnique({ where: { id: PLATFORM_API_WALLET_ID } }),
      tx.apiServicePrice.findMany({ where: { serviceKey: { in: API_BILLABLE_SERVICES.map((service) => service.serviceKey) } } }),
    ]);
    if (!wallet) throw new Error('Platform API wallet is unavailable.');
    return serializeSummary(wallet, prices);
  }
}

export const apiWalletBillingService = new ApiWalletBillingService();
