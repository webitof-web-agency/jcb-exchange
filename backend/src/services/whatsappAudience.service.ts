import prisma from '../lib/prisma';
import { normalizeWhatsAppRecipientPhone } from '../modules/whatsapp-core';
import type { WhatsAppPublishedBroadcastAudience, WhatsAppPublishedBroadcastConsentCategory } from '../modules/whatsapp-core';
import { mergePublishedBroadcastRecipients, type PublishedBroadcastRecipient } from '../utils/publishedBroadcastAudience';

export type WhatsAppPublishedAudienceRecipient = PublishedBroadcastRecipient;

const firstValidWhatsAppPhone = (...values: Array<string | null | undefined>) => {
  for (const value of values) {
    const normalized = normalizeWhatsAppRecipientPhone(value);
    if (normalized) return normalized;
  }
  return null;
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
    const [users, candidates] = await Promise.all([
      prisma.user.findMany({
        where: { role: 'CUSTOMER', status: 'ACTIVE' },
        select: { id: true, mobile: true, whatsappNumber: true },
      }),
      prisma.candidate.findMany({ select: { id: true, mobile: true } }),
    ]);

    const userRecipients = users.flatMap((user) => {
      const phone = firstValidWhatsAppPhone(user.whatsappNumber, user.mobile);
      return phone && optedInPhones.has(phone)
        ? [{ recipientType: 'CUSTOMER' as const, recipientPhone: phone, sourceEntityType: 'USER' as const, sourceEntityId: user.id }]
        : [];
    });

    const candidateRecipients = candidates.flatMap((candidate) => {
      const phone = firstValidWhatsAppPhone(candidate.mobile);
      return phone && optedInPhones.has(phone)
        ? [{ recipientType: 'CANDIDATE' as const, recipientPhone: phone, sourceEntityType: 'CANDIDATE' as const, sourceEntityId: candidate.id }]
        : [];
    });

    return mergePublishedBroadcastRecipients([userRecipients, candidateRecipients]);
  }

  return Array.from(byPhone.values());
};
