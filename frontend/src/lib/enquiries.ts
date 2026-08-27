'use client';

import api from '@/lib/api';

export type PublicContactEnquiryType = 'CALL' | 'WHATSAPP';

export const createPublicContactEnquiry = async ({
  listingId,
  partnerProfileId,
  enquiryType,
}: {
  listingId?: string | null;
  partnerProfileId?: string | null;
  enquiryType: PublicContactEnquiryType;
}) => {
  const response = await api.post('/leads/public-contact', {
    listingId,
    partnerProfileId,
    enquiryType,
  });

  return response.data;
};
