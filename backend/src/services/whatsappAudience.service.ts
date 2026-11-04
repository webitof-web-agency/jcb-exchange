import { NotificationChannel } from '@prisma/client';
import type { WhatsAppPublishedBroadcastAudience, WhatsAppPublishedBroadcastConsentCategory } from '../modules/whatsapp-core';
import { getEnabledNotificationAudienceRecipients } from './notificationRecipient.service';
import type { PublishedBroadcastRecipient } from '../utils/publishedBroadcastAudience';

export type WhatsAppPublishedAudienceRecipient = PublishedBroadcastRecipient;

export const getWhatsAppPublishedBroadcastRecipients = async (
  audience: WhatsAppPublishedBroadcastAudience,
  _consentCategory: WhatsAppPublishedBroadcastConsentCategory,
): Promise<WhatsAppPublishedAudienceRecipient[]> => {
  const eventCode = audience === 'MARKETPLACE'
    ? 'MARKETPLACE_NEW_LISTING_PUBLISHED'
    : 'RECRUITMENT_NEW_JOB_PUBLISHED';
  return getEnabledNotificationAudienceRecipients({
    eventCode,
    audience,
    channel: NotificationChannel.WHATSAPP,
  });
};
