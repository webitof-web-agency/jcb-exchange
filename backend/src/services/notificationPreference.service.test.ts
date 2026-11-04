import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildNotificationPreferenceInputs,
  initializeNotificationPreferences,
  initializeUserNotificationPreferences,
  type NotificationPreferenceDb,
} from './notificationPreference.service';

test('builds enabled WhatsApp and SMS preferences for every notification category', () => {
  const now = new Date('2026-11-04T10:00:00.000Z');
  const rows = buildNotificationPreferenceInputs({
    userId: 'user-1',
    mobile: '+91 98765 43210',
    whatsappNumber: '919876543210',
    now,
    source: 'ACCOUNT_CREATED',
  });

  assert.equal(rows.length, 8);
  assert.deepEqual(new Set(rows.map((row) => row.channel)), new Set(['SMS', 'WHATSAPP']));
  assert.deepEqual(new Set(rows.map((row) => row.category)), new Set(['TRANSACTIONAL', 'OPERATIONAL', 'MARKETING', 'JOB_ALERTS']));
  assert.ok(rows.every((row) => row.phone === '9876543210'));
  assert.ok(rows.every((row) => row.status === 'ENABLED'));
  assert.ok(rows.every((row) => row.optedInAt && new Date(row.optedInAt).getTime() === now.getTime()));
  assert.ok(rows.every((row) => row.source === 'ACCOUNT_CREATED'));
  assert.ok(rows.every((row) => row.userId === 'user-1'));
});

test('uses mobile as WhatsApp fallback and deduplicates identical channel contacts', () => {
  const rows = buildNotificationPreferenceInputs({ candidateId: 'candidate-1', mobile: '09876543210' });

  assert.equal(rows.length, 8);
  assert.ok(rows.every((row) => row.phone === '9876543210'));
  assert.ok(rows.every((row) => row.candidateId === 'candidate-1'));
});

test('skips invalid or missing contacts without creating unsafe preference rows', () => {
  assert.deepEqual(buildNotificationPreferenceInputs({ userId: 'user-1' }), []);
  assert.deepEqual(buildNotificationPreferenceInputs({ userId: 'user-1', mobile: '12345', whatsappNumber: '+91 12345' }), []);
});

test('initializes preferences idempotently without overwriting existing state', async () => {
  const calls: Array<Record<string, unknown>> = [];
  const db = {
    notificationPreference: {
      createMany: async (args: Record<string, unknown>) => {
        calls.push(args);
        return { count: 8 };
      },
    },
  } as unknown as NotificationPreferenceDb;

  const result = await initializeNotificationPreferences({ userId: 'user-1', mobile: '9876543210' }, db);

  assert.deepEqual(result, { attempted: 8, skipped: 0 });
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.skipDuplicates, true);
  assert.equal((calls[0]?.data as unknown[]).length, 8);
  assert.ok((calls[0]?.data as Array<Record<string, unknown>>).every((row) => row.status === 'ENABLED'));
});

test('initializes preferences from a newly created account contact payload', async () => {
  const calls: Array<Record<string, unknown>> = [];
  const db = {
    notificationPreference: {
      createMany: async (args: Record<string, unknown>) => {
        calls.push(args);
        return { count: 8 };
      },
    },
  } as unknown as NotificationPreferenceDb;

  await initializeUserNotificationPreferences({
    id: 'user-2',
    mobile: '+91 90000 00000',
    whatsappNumber: '9000000001',
  }, db);

  assert.equal(calls.length, 1);
  assert.ok(JSON.stringify(calls[0]?.data).includes('9000000001'));
  assert.ok(JSON.stringify(calls[0]?.data).includes('9000000000'));
});
