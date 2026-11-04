import assert from 'node:assert/strict';
import test from 'node:test';
import { NotificationCategory, NotificationChannel, NotificationPreferenceStatus } from '@prisma/client';
import {
  getEnabledNotificationAudienceRecipients,
  getNotificationCategoryForEvent,
  resolveNotificationPreference,
  type NotificationRecipientDb,
} from './notificationRecipient.service';

test('maps notification events to stable preference categories', () => {
  assert.equal(getNotificationCategoryForEvent('MARKETPLACE_NEW_LISTING_PUBLISHED'), NotificationCategory.MARKETING);
  assert.equal(getNotificationCategoryForEvent('RECRUITMENT_NEW_JOB_PUBLISHED'), NotificationCategory.JOB_ALERTS);
  assert.equal(getNotificationCategoryForEvent('CRM_FOLLOW_UP_REMINDER'), NotificationCategory.OPERATIONAL);
  assert.equal(getNotificationCategoryForEvent('LISTING_PAYMENT_APPROVED'), NotificationCategory.TRANSACTIONAL);
  assert.equal(getNotificationCategoryForEvent('A_FUTURE_EVENT'), NotificationCategory.TRANSACTIONAL);
});

test('resolves an enabled preference using normalized phone, channel, and event category', async () => {
  let lookup: Record<string, unknown> | undefined;
  const db = {
    notificationPreference: {
      findUnique: async (args: Record<string, unknown>) => {
        lookup = args;
        return { status: NotificationPreferenceStatus.ENABLED };
      },
    },
  } as unknown as NotificationRecipientDb;

  assert.equal(await resolveNotificationPreference({
    eventCode: 'RECRUITMENT_NEW_JOB_PUBLISHED',
    channel: NotificationChannel.WHATSAPP,
    recipientPhone: '+91 98765 43210',
    db,
  }), true);
  assert.deepEqual(lookup?.where, {
    phone_channel_category: {
      phone: '9876543210',
      channel: NotificationChannel.WHATSAPP,
      category: NotificationCategory.JOB_ALERTS,
    },
  });
});

test('blocks disabled preferences and preserves legacy unknown contacts', async () => {
  const disabledDb = {
    notificationPreference: { findUnique: async () => ({ status: NotificationPreferenceStatus.DISABLED }) },
  } as unknown as NotificationRecipientDb;
  const unknownDb = {
    notificationPreference: { findUnique: async () => null },
  } as unknown as NotificationRecipientDb;

  assert.equal(await resolveNotificationPreference({
    eventCode: 'LISTING_PAYMENT_APPROVED',
    channel: NotificationChannel.SMS,
    recipientPhone: '9876543210',
    db: disabledDb,
  }), false);
  assert.equal(await resolveNotificationPreference({
    eventCode: 'CRM_LEAD_ACKNOWLEDGEMENT',
    channel: NotificationChannel.WHATSAPP,
    recipientPhone: '9876543210',
    db: unknownDb,
  }), null);
});

test('honors an explicit legacy WhatsApp revoke for automatic delivery', async () => {
  const db = {
    notificationPreference: {
      findUnique: async () => ({ status: NotificationPreferenceStatus.ENABLED }),
    },
    whatsAppConsent: {
      findFirst: async () => ({ optedIn: false }),
    },
  } as unknown as NotificationRecipientDb;

  assert.equal(await resolveNotificationPreference({
    eventCode: 'MARKETPLACE_NEW_LISTING_PUBLISHED',
    channel: NotificationChannel.WHATSAPP,
    recipientPhone: '9876543210',
    db,
  }), false);
});

test('resolves enabled marketplace and recruitment recipients once per phone', async () => {
  const rows = [
    { phone: '9876543210', userId: 'customer-1', candidateId: null, user: { role: 'CUSTOMER', status: 'ACTIVE' } },
    { phone: '9876543210', userId: null, candidateId: 'candidate-1', user: null },
    { phone: '9000000000', userId: 'customer-2', candidateId: null, user: { role: 'CUSTOMER', status: 'INACTIVE' } },
    { phone: '9123456789', userId: null, candidateId: 'candidate-2', user: null },
    { phone: '9988776655', userId: 'partner-1', candidateId: null, user: { role: 'PARTNER', status: 'ACTIVE' } },
  ];
  const db = {
    notificationPreference: {
      findMany: async () => rows,
    },
  } as unknown as NotificationRecipientDb;

  const marketplace = await getEnabledNotificationAudienceRecipients({
    eventCode: 'MARKETPLACE_NEW_LISTING_PUBLISHED',
    audience: 'MARKETPLACE',
    channel: NotificationChannel.SMS,
    db,
  });
  const recruitment = await getEnabledNotificationAudienceRecipients({
    eventCode: 'RECRUITMENT_NEW_JOB_PUBLISHED',
    audience: 'RECRUITMENT',
    channel: NotificationChannel.WHATSAPP,
    db,
  });

  assert.deepEqual(marketplace, [{
    recipientType: 'CUSTOMER',
    recipientPhone: '9876543210',
    sourceEntityType: 'USER',
    sourceEntityId: 'customer-1',
  }]);
  assert.deepEqual(recruitment, [
    {
      recipientType: 'CUSTOMER',
      recipientPhone: '9876543210',
      sourceEntityType: 'USER',
      sourceEntityId: 'customer-1',
    },
    {
      recipientType: 'CANDIDATE',
      recipientPhone: '9123456789',
      sourceEntityType: 'CANDIDATE',
      sourceEntityId: 'candidate-2',
    },
  ]);
});
