import {
  NotificationCategory,
  NotificationChannel,
  NotificationPreferenceStatus,
  Prisma,
} from '@prisma/client';
import prisma from '../lib/prisma';
import { normalizeIndianMobile } from '../modules/finance-hub/utils/india';

export const NOTIFICATION_CATEGORIES = [
  NotificationCategory.TRANSACTIONAL,
  NotificationCategory.OPERATIONAL,
  NotificationCategory.MARKETING,
  NotificationCategory.JOB_ALERTS,
] as const;

const DEFAULT_SOURCE = 'ACCOUNT_CREATED_AUTO';
const DEFAULT_SOURCE_VERSION = 'v1';

export type NotificationPreferenceInitializationInput = {
  userId?: string | null;
  candidateId?: string | null;
  mobile?: unknown;
  whatsappNumber?: unknown;
  source?: string | null;
  sourceVersion?: string | null;
  now?: Date;
};

export type NotificationPreferenceDb =
  | Pick<typeof prisma, 'notificationPreference'>
  | Pick<Prisma.TransactionClient, 'notificationPreference'>;

export type NotificationPreferenceAccountContact = {
  id: string;
  mobile?: string | null;
  whatsappNumber?: string | null;
};

/** Builds one enabled row for each channel/category that has a valid destination. */
export const buildNotificationPreferenceInputs = (
  input: NotificationPreferenceInitializationInput,
): Prisma.NotificationPreferenceUncheckedCreateInput[] => {
  const mobile = normalizeIndianMobile(input.mobile);
  const whatsapp = normalizeIndianMobile(input.whatsappNumber) ?? mobile;
  const now = input.now ?? new Date();
  const source = input.source?.trim() || DEFAULT_SOURCE;
  const sourceVersion = input.sourceVersion?.trim() || DEFAULT_SOURCE_VERSION;
  const destinations: Array<[NotificationChannel, string | null]> = [
    [NotificationChannel.SMS, mobile],
    [NotificationChannel.WHATSAPP, whatsapp],
  ];

  return destinations.flatMap(([channel, phone]) => {
    if (!phone) return [];
    return NOTIFICATION_CATEGORIES.map((category) => ({
      userId: input.userId ?? null,
      candidateId: input.candidateId ?? null,
      phone,
      channel,
      category,
      status: NotificationPreferenceStatus.ENABLED,
      source,
      sourceVersion,
      optedInAt: now,
    }));
  });
};

/**
 * Creates the preference rows without resetting an existing opt-out.
 * The composite destination key makes repeated calls safe and idempotent.
 */
export const initializeNotificationPreferences = async (
  input: NotificationPreferenceInitializationInput,
  db: NotificationPreferenceDb = prisma,
) => {
  const rows = buildNotificationPreferenceInputs(input);

  await db.notificationPreference.createMany({
    data: rows,
    // Never overwrite a user's later opt-out or audit history on a retry.
    skipDuplicates: true,
  });

  return { attempted: rows.length, skipped: 8 - rows.length };
};

export const initializeUserNotificationPreferences = (
  user: NotificationPreferenceAccountContact,
  db: NotificationPreferenceDb = prisma,
) => initializeNotificationPreferences({
  userId: user.id,
  mobile: user.mobile,
  whatsappNumber: user.whatsappNumber,
}, db);
