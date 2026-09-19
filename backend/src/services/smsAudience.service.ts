import prisma from '../lib/prisma';
import { normalizeSmsRecipientPhone } from '../modules/sms-core';

export type SmsPublishedBroadcastAudience = 'MARKETPLACE' | 'RECRUITMENT';

export type SmsAudienceRecipient = {
  recipientType: 'CUSTOMER' | 'CANDIDATE';
  recipientPhone: string;
  sourceEntityType: 'USER' | 'CANDIDATE';
  sourceEntityId: string;
};

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

  const candidates = await prisma.candidate.findMany({ select: { id: true, mobile: true } });
  const byPhone = new Map<string, SmsAudienceRecipient>();
  for (const candidate of candidates) {
    const phone = normalizeSmsRecipientPhone(candidate.mobile);
    if (phone && !byPhone.has(phone)) {
      byPhone.set(phone, { recipientType: 'CANDIDATE', recipientPhone: phone, sourceEntityType: 'CANDIDATE', sourceEntityId: candidate.id });
    }
  }
  return Array.from(byPhone.values());
};
