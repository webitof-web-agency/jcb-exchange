import prisma from '../lib/prisma';
import { normalizeWhatsAppRecipientPhone } from '../modules/whatsapp-core';
import type { WhatsAppPublishedBroadcastAudience, WhatsAppPublishedBroadcastConsentCategory } from '../modules/whatsapp-core';

export type WhatsAppPublishedAudienceRecipient = {
  recipientType: 'CUSTOMER' | 'CANDIDATE';
  recipientPhone: string;
  sourceEntityType: 'USER' | 'CANDIDATE';
  sourceEntityId: string;
};

export const getWhatsAppPublishedBroadcastRecipients = async (
  audience: WhatsAppPublishedBroadcastAudience,
  consentCategory: WhatsAppPublishedBroadcastConsentCategory,
): Promise<WhatsAppPublishedAudienceRecipient[]> => {
  const consents = await prisma.whatsAppConsent.findMany({
    where: { category: consentCategory, optedIn: true },
    select: { phone: true },
  });
  const optedInPhones = new Set(consents.map((consent) => consent.phone));
  const byPhone = new Map<string, WhatsAppPublishedAudienceRecipient>();

  if (audience === 'MARKETPLACE') {
    const users = await prisma.user.findMany({
      where: { role: 'CUSTOMER', status: 'ACTIVE' },
      select: { id: true, mobile: true, whatsappNumber: true },
    });

    for (const user of users) {
      const phone = normalizeWhatsAppRecipientPhone(user.whatsappNumber || user.mobile);
      if (phone && optedInPhones.has(phone) && !byPhone.has(phone)) {
        byPhone.set(phone, {
          recipientType: 'CUSTOMER',
          recipientPhone: phone,
          sourceEntityType: 'USER',
          sourceEntityId: user.id,
        });
      }
    }
  } else {
    const candidates = await prisma.candidate.findMany({ select: { id: true, mobile: true } });

    for (const candidate of candidates) {
      const phone = normalizeWhatsAppRecipientPhone(candidate.mobile);
      if (phone && optedInPhones.has(phone) && !byPhone.has(phone)) {
        byPhone.set(phone, {
          recipientType: 'CANDIDATE',
          recipientPhone: phone,
          sourceEntityType: 'CANDIDATE',
          sourceEntityId: candidate.id,
        });
      }
    }
  }

  return Array.from(byPhone.values());
};
