import prisma from '../lib/prisma';
import { normalizeSmsRecipientPhone } from '../modules/sms-core';
import { mergePublishedBroadcastRecipients, type PublishedBroadcastRecipient } from '../utils/publishedBroadcastAudience';

export type SmsPublishedBroadcastAudience = 'MARKETPLACE' | 'RECRUITMENT';

export type SmsAudienceRecipient = PublishedBroadcastRecipient;

export const getSmsPublishedBroadcastRecipients = async (
  audience: SmsPublishedBroadcastAudience,
): Promise<SmsAudienceRecipient[]> => {
  if (audience === 'MARKETPLACE') {
    const users = await prisma.user.findMany({
      where: { role: 'CUSTOMER', status: 'ACTIVE' },
      select: { id: true, mobile: true },
    });
    const byPhone = new Map<string, SmsAudienceRecipient>();
    for (const user of users) {
      const phone = normalizeSmsRecipientPhone(user.mobile);
      if (phone && !byPhone.has(phone)) {
        byPhone.set(phone, { recipientType: 'CUSTOMER', recipientPhone: phone, sourceEntityType: 'USER', sourceEntityId: user.id });
      }
    }
    return Array.from(byPhone.values());
  }

  const [users, candidates] = await Promise.all([
    prisma.user.findMany({
      where: { role: 'CUSTOMER', status: 'ACTIVE' },
      select: { id: true, mobile: true },
    }),
    prisma.candidate.findMany({ select: { id: true, mobile: true } }),
  ]);
  const userRecipients = users.flatMap((user) => {
    const phone = normalizeSmsRecipientPhone(user.mobile);
    return phone
      ? [{ recipientType: 'CUSTOMER' as const, recipientPhone: phone, sourceEntityType: 'USER' as const, sourceEntityId: user.id }]
      : [];
  });
  const candidateRecipients = candidates.flatMap((candidate) => {
    const phone = normalizeSmsRecipientPhone(candidate.mobile);
    return phone
      ? [{ recipientType: 'CANDIDATE' as const, recipientPhone: phone, sourceEntityType: 'CANDIDATE' as const, sourceEntityId: candidate.id }]
      : [];
  });
  return mergePublishedBroadcastRecipients([userRecipients, candidateRecipients]);
};
