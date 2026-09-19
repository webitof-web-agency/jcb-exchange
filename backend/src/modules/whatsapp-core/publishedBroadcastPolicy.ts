export type PublishedBroadcastEvent =
  | 'MARKETPLACE_NEW_LISTING_PUBLISHED'
  | 'RECRUITMENT_NEW_JOB_PUBLISHED';

export type PublishedBroadcastAudience = {
  consentCategory: 'MARKETING' | 'JOB_ALERTS';
  recipientType: 'CUSTOMER' | 'CANDIDATE';
};

export const shouldDispatchPublishedBroadcast = ({
  previousStatus,
  nextStatus,
}: {
  previousStatus?: string | null;
  nextStatus: string;
}) => previousStatus !== 'PUBLISHED' && nextStatus === 'PUBLISHED';

export const getPublishedBroadcastAudience = (eventCode: PublishedBroadcastEvent): PublishedBroadcastAudience => {
  if (eventCode === 'MARKETPLACE_NEW_LISTING_PUBLISHED') {
    return { consentCategory: 'MARKETING', recipientType: 'CUSTOMER' };
  }
  return { consentCategory: 'JOB_ALERTS', recipientType: 'CANDIDATE' };
};
