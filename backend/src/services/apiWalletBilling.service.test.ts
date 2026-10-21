import assert from 'node:assert/strict';
import test from 'node:test';

import {
  API_BILLABLE_SERVICES,
  ApiWalletBillingService,
  createApiBillingWebhookSignature,
  formatRupeesFromPaise,
  rupeesToPaise,
  verifyApiBillingWebhookSignature,
} from './apiWalletBilling.service';

test('exposes separate RC Owner History and RC Full billing services', () => {
  assert.equal(
    API_BILLABLE_SERVICES.find((service) => service.serviceKey === 'RC_OWNER_HISTORY')?.displayName,
    'RC Owner History',
  );
  assert.equal(
    API_BILLABLE_SERVICES.find((service) => service.serviceKey === 'RC_FULL')?.displayName,
    'RC Full',
  );
});

test('accepts rupee-form amounts exactly and formats them for display', () => {
  assert.equal(rupeesToPaise('0.2'), 20);
  assert.equal(rupeesToPaise('0.20'), 20);
  assert.equal(rupeesToPaise('125'), 12_500);
  assert.equal(formatRupeesFromPaise(20), '0.20');
  assert.equal(formatRupeesFromPaise(12_500), '125.00');
});

test('rejects unsafe rupee amounts instead of rounding them', () => {
  for (const amount of ['', '-1', '0.001', '1e2', 'abc', 0.2]) {
    assert.throws(() => rupeesToPaise(amount));
  }
});

test('accepts only an exact signed webhook payload', () => {
  const secret = 'wallet-webhook-secret';
  const body = Buffer.from('{"eventId":"evt-1"}', 'utf8');
  const signature = createApiBillingWebhookSignature(body, secret);

  assert.equal(verifyApiBillingWebhookSignature(body, signature, secret), true);
  assert.equal(verifyApiBillingWebhookSignature(Buffer.from('{"eventId":"evt-2"}', 'utf8'), signature, secret), false);
  assert.equal(verifyApiBillingWebhookSignature(body, signature, undefined), false);
});

test('processes a signed RC_FULL service price webhook', async () => {
  const wallet = { id: 'platform', currency: 'INR', balancePaise: 10_000, mode: 'ACTIVE' };
  const prices: any[] = [];
  let createdEvent: Record<string, unknown> | null = null;
  const service = new ApiWalletBillingService({
    apiWallet: { upsert: async () => wallet },
    $transaction: async (callback: (tx: any) => Promise<unknown>) => callback({
      apiBillingWebhookEvent: {
        findUnique: async () => null,
        create: async ({ data }: { data: Record<string, unknown> }) => { createdEvent = data; return data; },
      },
      apiServicePrice: {
        upsert: async ({ create, update }: { create: any; update: any }) => {
          const existing = prices.find((price) => price.serviceKey === create.serviceKey);
          if (existing) Object.assign(existing, { amountPaise: update.amountPaise, active: update.active });
          else prices.push({ ...create });
          return existing || prices[prices.length - 1];
        },
        findMany: async () => prices,
      },
      apiWallet: { findUnique: async () => wallet },
    }),
  });
  const body = Buffer.from(JSON.stringify({
    eventId: 'evt-rc-full-price',
    eventType: 'SERVICE_PRICE_SET',
    occurredAt: new Date().toISOString(),
    data: { serviceKey: 'RC_FULL', priceRupees: '5.00', active: true },
  }), 'utf8');

  const result = await service.processSignedWebhook(body);
  const rcFull = result.summary.services.find((item) => item.serviceKey === 'RC_FULL');

  assert.equal((createdEvent as Record<string, unknown> | null)?.eventType, 'SERVICE_PRICE_SET');
  assert.equal(rcFull?.active, true);
  assert.equal(rcFull?.priceRupees, '5.00');
});

test('reverses a charged provider attempt exactly once', async () => {
  const wallet = { id: 'platform', currency: 'INR', balancePaise: 9_500, mode: 'ACTIVE' };
  const createdLedgers: Array<Record<string, unknown>> = [];
  let reversalExists = false;
  const usage = {
    id: 'usage-1',
    walletId: 'platform',
    serviceKey: 'RC_FULL',
    verificationRecordId: 'rc-record-1',
    requestedById: 'user-1',
    amountPaise: 500,
    ledger: {
      id: 'debit-ledger-1',
      type: 'DEBIT',
      amountPaise: 500,
    },
  };
  const service = new ApiWalletBillingService({
    apiWallet: { upsert: async () => wallet },
    $transaction: async (callback: (tx: any) => Promise<unknown>) => callback({
      apiUsageRecord: {
        findUnique: async () => usage,
      },
      apiWalletLedger: {
        findUnique: async () => (reversalExists ? { id: 'reversal-ledger-1', amountPaise: 500, balanceAfterPaise: 10_000 } : null),
        create: async ({ data }: { data: Record<string, unknown> }) => {
          reversalExists = true;
          createdLedgers.push(data);
          return { id: 'reversal-ledger-1', ...data };
        },
      },
      $queryRaw: async () => [{ balancePaise: 10_000 }],
    }),
  });

  const first = await (service as any).reverseProviderCharge({ usageId: 'usage-1', reason: 'verification_failed' });
  const second = await (service as any).reverseProviderCharge({ usageId: 'usage-1', reason: 'verification_failed' });

  assert.equal(first.reversed, true);
  assert.equal(first.amountPaise, 500);
  assert.equal(second.reversed, false);
  assert.equal(createdLedgers.length, 1);
  const createdLedger = createdLedgers[0];
  assert.ok(createdLedger);
  assert.equal(createdLedger.type, 'CREDIT');
  assert.equal(createdLedger.usageId, undefined);
  assert.equal(createdLedger.idempotencyKey, 'provider-reversal:usage-1');
});
