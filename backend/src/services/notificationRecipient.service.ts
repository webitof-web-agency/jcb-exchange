import {
  NotificationCategory,
  NotificationChannel,
  NotificationPreferenceStatus,
  Prisma,
  WhatsAppConsentCategory,
} from '@prisma/client';
import prisma from '../lib/prisma';
import { normalizeIndianMobile } from '../modules/finance-hub/utils/india';
import type { PublishedBroadcastRecipient } from '../utils/publishedBroadcastAudience';

type NotificationPreferenceModel = Pick<Prisma.TransactionClient['notificationPreference'], 'findUnique' | 'findMany'>;
type WhatsAppConsentModel = Pick<Prisma.TransactionClient['whatsAppConsent'], 'findFirst' | 'findMany'>;

export type NotificationRecipientDb = {
  notificationPreference: NotificationPreferenceModel;
  whatsAppConsent?: WhatsAppConsentModel;
};

export type NotificationAudience = 'MARKETPLACE' | 'RECRUITMENT';

const marketingEvents = new Set([
  'MARKETPLACE_NEW_LISTING_PUBLISHED',
  'CRM_MATCHING_LISTING',
  'CRM_REENGAGEMENT',
]);

const jobAlertEvents = new Set(['RECRUITMENT_NEW_JOB_PUBLISHED']);

const operationalEvents = new Set([
  'CRM_LEAD_ASSIGNED',
  'CRM_FOLLOW_UP_REMINDER',
  'CRM_APPOINTMENT_REMINDER',
  'RECRUITMENT_INTERVIEW_SCHEDULED',
  'RECRUITMENT_INTERVIEW_RESCHEDULED',
  'RECRUITMENT_INTERVIEW_CANCELLED',
]);

/** New events default to transactional so adding a template cannot silently become marketing. */
export const getNotificationCategoryForEvent = (eventCode: string): NotificationCategory => {
  if (marketingEvents.has(eventCode)) return NotificationCategory.MARKETING;
  if (jobAlertEvents.has(eventCode)) return NotificationCategory.JOB_ALERTS;
  if (operationalEvents.has(eventCode)) return NotificationCategory.OPERATIONAL;
  return NotificationCategory.TRANSACTIONAL;
};

const legacyConsentCategoryFor = (category: NotificationCategory) => {
  if (category === NotificationCategory.MARKETING) return WhatsAppConsentCategory.MARKETING;
  if (category === NotificationCategory.JOB_ALERTS) return WhatsAppConsentCategory.JOB_ALERTS;
  return null;
};

const legacyPhoneCandidates = (phone: string) => [phone, `91${phone}`];

const isLegacyWhatsAppRevoked = async ({
  db,
  category,
  phone,
}: {
  db: NotificationRecipientDb;
  category: NotificationCategory;
  phone: string;
}) => {
  const consentCategory = legacyConsentCategoryFor(category);
  if (!consentCategory || !db.whatsAppConsent) return false;
  const consent = await db.whatsAppConsent.findFirst({
    where: { category: consentCategory, phone: { in: legacyPhoneCandidates(phone) } },
    select: { optedIn: true },
  });
  return consent?.optedIn === false;
};

/**
 * Returns true/false for known preference rows. Null means no row exists, which
 * preserves delivery for legacy CRM contacts that are not platform accounts.
 */
export const resolveNotificationPreference = async ({
  eventCode,
  channel,
  recipientPhone,
  db = prisma,
}: {
  eventCode: string;
  channel: NotificationChannel;
  recipientPhone?: string | null;
  db?: NotificationRecipientDb;
}): Promise<boolean | null> => {
  const phone = normalizeIndianMobile(recipientPhone);
  if (!phone) return null;

  const category = getNotificationCategoryForEvent(eventCode);
  const preference = await db.notificationPreference.findUnique({
    where: { phone_channel_category: { phone, channel, category } },
    select: { status: true },
  });
  if (!preference) return null;
  if (preference.status !== NotificationPreferenceStatus.ENABLED) return false;
  if (channel === NotificationChannel.WHATSAPP && await isLegacyWhatsAppRevoked({ db, category, phone })) return false;
  return true;
};

type PreferenceAudienceRow = {
  phone: string;
  userId: string | null;
  candidateId: string | null;
  user: { role: string; status: string } | null;
};

const addRecipient = (
  byPhone: Map<string, PublishedBroadcastRecipient>,
  recipient: PublishedBroadcastRecipient,
) => {
  if (!byPhone.has(recipient.recipientPhone)) byPhone.set(recipient.recipientPhone, recipient);
};

/** Resolves only active logged-in customers and recruitment candidates with an enabled preference. */
export const getEnabledNotificationAudienceRecipients = async ({
  eventCode,
  audience,
  channel,
  db = prisma,
}: {
  eventCode: string;
  audience: NotificationAudience;
  channel: NotificationChannel;
  db?: NotificationRecipientDb;
}): Promise<PublishedBroadcastRecipient[]> => {
  const category = getNotificationCategoryForEvent(eventCode);
  const rows = await db.notificationPreference.findMany({
    where: { channel, category, status: NotificationPreferenceStatus.ENABLED },
    select: {
      phone: true,
      userId: true,
      candidateId: true,
      user: { select: { role: true, status: true } },
    },
  }) as PreferenceAudienceRow[];

  const revokedPhones = new Set<string>();
  const consentCategory = legacyConsentCategoryFor(category);
  if (channel === NotificationChannel.WHATSAPP && consentCategory && db.whatsAppConsent) {
    const revoked = await db.whatsAppConsent.findMany({
      where: { category: consentCategory, optedIn: false },
      select: { phone: true },
    });
    for (const consent of revoked) {
      const phone = normalizeIndianMobile(consent.phone);
      if (phone) revokedPhones.add(phone);
    }
  }

  const byPhone = new Map<string, PublishedBroadcastRecipient>();
  for (const row of rows) {
    const phone = normalizeIndianMobile(row.phone);
    if (!phone || revokedPhones.has(phone)) continue;

    const isActiveCustomer = row.user?.role === 'CUSTOMER' && row.user.status === 'ACTIVE';
    if (isActiveCustomer) {
      addRecipient(byPhone, {
        recipientType: 'CUSTOMER',
        recipientPhone: phone,
        sourceEntityType: 'USER',
        sourceEntityId: row.userId || '',
      });
    }

    if (audience === 'RECRUITMENT' && row.candidateId) {
      addRecipient(byPhone, {
        recipientType: 'CANDIDATE',
        recipientPhone: phone,
        sourceEntityType: 'CANDIDATE',
        sourceEntityId: row.candidateId,
      });
    }
  }

  if (audience === 'MARKETPLACE') {
    return Array.from(byPhone.values()).filter((recipient) => recipient.recipientType === 'CUSTOMER');
  }
  return Array.from(byPhone.values());
};
