import assert from 'node:assert/strict';
import test from 'node:test';
import {
  backfillNotificationPreferences,
  type NotificationPreferenceBackfillDb,
} from './notificationPreferenceBackfill.service';

const buildDb = () => {
  const creates: Array<Record<string, unknown>> = [];
  let userReads = 0;
  let candidateReads = 0;
  const db = {
    user: {
      findMany: async () => {
        userReads += 1;
        return userReads === 1
          ? [
            { id: 'user-1', mobile: '9876543210', whatsappNumber: '9876543211' },
            { id: 'user-2', mobile: '12345', whatsappNumber: null },
          ]
          : [];
      },
    },
    candidate: {
      findMany: async () => {
        candidateReads += 1;
        return candidateReads === 1 ? [{ id: 'candidate-1', mobile: '9000000000' }] : [];
      },
    },
    notificationPreference: {
      createMany: async (args: Record<string, unknown>) => {
        creates.push(args);
        return { count: (args.data as unknown[]).length };
      },
    },
  } as unknown as NotificationPreferenceBackfillDb;

  return { db, creates };
};

test('backfills users and candidates with valid contacts and reports invalid records', async () => {
  const { db, creates } = buildDb();

  const report = await backfillNotificationPreferences(db, { batchSize: 2 });

  assert.deepEqual(report, {
    dryRun: false,
    usersScanned: 2,
    candidatesScanned: 1,
    preferenceRowsAttempted: 16,
    recordsWithoutValidContact: 1,
  });
  assert.equal(creates.reduce((total, call) => total + (call.data as unknown[]).length, 0), 16);
  assert.ok(creates.every((call) => call.skipDuplicates === true));
  assert.ok(creates.every((call) => JSON.stringify(call.data).includes('BACKFILL_EXISTING_ACCOUNT')));
});

test('dry-run reports the backfill without writing preference rows', async () => {
  const { db, creates } = buildDb();

  const report = await backfillNotificationPreferences(db, { dryRun: true, batchSize: 2 });

  assert.equal(report.dryRun, true);
  assert.equal(report.preferenceRowsAttempted, 16);
  assert.equal(creates.length, 0);
});
