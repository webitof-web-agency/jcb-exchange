import prisma from '../lib/prisma';
import { normalizeWhatsAppRecipientPhone } from '../modules/whatsapp-core';

export type WhatsAppConsentAudience = 'MARKETING' | 'JOB_ALERTS';

export type WhatsAppAudienceRecipient = {
  recipientType: 'CUSTOMER' | 'CANDIDATE';
  recipientPhone: string;
  sourceEntityType: 'USER' | 'CANDIDATE';
  sourceEntityId: string;
};

export const getOptedInWhatsAppRecipients = async (
  category: WhatsAppConsentAudience,
): Promise<WhatsAppAudienceRecipient[]> => {
  const consents = await prisma.whatsAppConsent.findMany({
    where: { category, optedIn: true },
    select: { phone: true },
  });
  const optedInPhones = new Set(consents.map((consent) => consent.phone));

  if (category === 'MARKETING') {
    const users = await prisma.user.findMany({
      where: { role: 'CUSTOMER', status: 'ACTIVE' },
      select: { id: true, mobile: true, whatsappNumber: true },
    });
    return users.flatMap((user) => {
      const phone = normalizeWhatsAppRecipientPhone(user.whatsappNumber || user.mobile);
      return phone && optedInPhones.has(phone)
        ? [{ recipientType: 'CUSTOMER' as const, recipientPhone: phone, sourceEntityType: 'USER' as const, sourceEntityId: user.id }]
        : [];
    });
  }

  const candidates = await prisma.candidate.findMany({ select: { id: true, mobile: true } });
  return candidates.flatMap((candidate) => {
    const phone = normalizeWhatsAppRecipientPhone(candidate.mobile);
    return phone && optedInPhones.has(phone)
      ? [{ recipientType: 'CANDIDATE' as const, recipientPhone: phone, sourceEntityType: 'CANDIDATE' as const, sourceEntityId: candidate.id }]
      : [];
  });
};
