import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import {
  buildNotificationPreferenceInputs,
  initializeNotificationPreferences,
  type NotificationPreferenceDb,
} from './notificationPreference.service';

const BACKFILL_SOURCE = 'BACKFILL_EXISTING_ACCOUNT';
const BACKFILL_SOURCE_VERSION = 'v1';

export type NotificationPreferenceBackfillDb = Prisma.TransactionClient | typeof prisma;

export type NotificationPreferenceBackfillOptions = {
  dryRun?: boolean;
  batchSize?: number;
};

export type NotificationPreferenceBackfillReport = {
  dryRun: boolean;
  usersScanned: number;
  candidatesScanned: number;
  preferenceRowsAttempted: number;
  recordsWithoutValidContact: number;
};

const normalizedBatchSize = (value: number | undefined) => Math.min(500, Math.max(1, Math.trunc(value || 100)));

const userWhere: Prisma.UserWhereInput = {
  OR: [{ mobile: { not: null } }, { whatsappNumber: { not: null } }],
};

const processRows = async (
  rows: Array<{ id: string; mobile?: string | null; whatsappNumber?: string | null }>,
  kind: 'user' | 'candidate',
  db: NotificationPreferenceBackfillDb,
  dryRun: boolean,
) => {
  let preferenceRowsAttempted = 0;
  let recordsWithoutValidContact = 0;

  for (const row of rows) {
    const input = {
      ...(kind === 'user' ? { userId: row.id } : { candidateId: row.id }),
      mobile: row.mobile,
      whatsappNumber: row.whatsappNumber,
      source: BACKFILL_SOURCE,
      sourceVersion: BACKFILL_SOURCE_VERSION,
    };
    const preferenceRows = buildNotificationPreferenceInputs(input);

    if (!preferenceRows.length) {
      recordsWithoutValidContact += 1;
      continue;
    }

    preferenceRowsAttempted += preferenceRows.length;
    if (!dryRun) {
      await initializeNotificationPreferences(input, db as NotificationPreferenceDb);
    }
  }

  return { preferenceRowsAttempted, recordsWithoutValidContact };
};

export const backfillNotificationPreferences = async (
  db: NotificationPreferenceBackfillDb = prisma,
  options: NotificationPreferenceBackfillOptions = {},
): Promise<NotificationPreferenceBackfillReport> => {
  const dryRun = options.dryRun === true;
  const batchSize = normalizedBatchSize(options.batchSize);
  let usersScanned = 0;
  let candidatesScanned = 0;
  let preferenceRowsAttempted = 0;
  let recordsWithoutValidContact = 0;
  let userCursor: string | undefined;
  let candidateCursor: string | undefined;

  while (true) {
    const users = await db.user.findMany({
      where: userWhere,
      orderBy: { id: 'asc' },
      take: batchSize,
      ...(userCursor ? { skip: 1, cursor: { id: userCursor } } : {}),
      select: { id: true, mobile: true, whatsappNumber: true },
    });
    if (!users.length) break;

    usersScanned += users.length;
    const userReport = await processRows(users, 'user', db, dryRun);
    preferenceRowsAttempted += userReport.preferenceRowsAttempted;
    recordsWithoutValidContact += userReport.recordsWithoutValidContact;

    if (users.length < batchSize) break;
    userCursor = users[users.length - 1]?.id;
  }

  while (true) {
    const candidates = await db.candidate.findMany({
      orderBy: { id: 'asc' },
      take: batchSize,
      ...(candidateCursor ? { skip: 1, cursor: { id: candidateCursor } } : {}),
      select: { id: true, mobile: true },
    });
    if (!candidates.length) break;

    candidatesScanned += candidates.length;
    const candidateReport = await processRows(candidates, 'candidate', db, dryRun);
    preferenceRowsAttempted += candidateReport.preferenceRowsAttempted;
    recordsWithoutValidContact += candidateReport.recordsWithoutValidContact;

    if (candidates.length < batchSize) break;
    candidateCursor = candidates[candidates.length - 1]?.id;
  }

  return {
    dryRun,
    usersScanned,
    candidatesScanned,
    preferenceRowsAttempted,
    recordsWithoutValidContact,
  };
};
