type ListingContactPartner = {
  mobile?: unknown;
  whatsappNumber?: unknown;
  partnerProfile?: {
    alternateMobile?: unknown;
  } | null;
} | null | undefined;

const normalizeContactNumber = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';

export const resolveListingContactNumber = (partner: ListingContactPartner) =>
  normalizeContactNumber(partner?.mobile)
  || normalizeContactNumber(partner?.partnerProfile?.alternateMobile)
  || normalizeContactNumber(partner?.whatsappNumber)
  || null;
