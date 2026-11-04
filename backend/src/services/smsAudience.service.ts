import { NotificationChannel } from '@prisma/client';
import type { PublishedBroadcastRecipient } from '../utils/publishedBroadcastAudience';
import { getEnabledNotificationAudienceRecipients } from './notificationRecipient.service';

export type SmsPublishedBroadcastAudience = 'MARKETPLACE' | 'RECRUITMENT';

export type SmsAudienceRecipient = PublishedBroadcastRecipient;

export const getSmsPublishedBroadcastRecipients = async (
  audience: SmsPublishedBroadcastAudience,
): Promise<SmsAudienceRecipient[]> => {
  const eventCode = audience === 'MARKETPLACE'
    ? 'MARKETPLACE_NEW_LISTING_PUBLISHED'
    : 'RECRUITMENT_NEW_JOB_PUBLISHED';
  return getEnabledNotificationAudienceRecipients({
    eventCode,
    audience,
    channel: NotificationChannel.SMS,
  });
};
