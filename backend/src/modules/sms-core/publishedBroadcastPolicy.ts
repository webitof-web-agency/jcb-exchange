export type SmsPublishedBroadcastEvent =
  | 'MARKETPLACE_NEW_LISTING_PUBLISHED'
  | 'RECRUITMENT_NEW_JOB_PUBLISHED';

export const shouldDispatchSmsPublishedBroadcast = ({
  previousStatus,
  nextStatus,
}: {
  previousStatus?: string | null;
  nextStatus: string;
}) => previousStatus !== 'PUBLISHED' && nextStatus === 'PUBLISHED';

export const getSmsPublishedBroadcastRecipientType = (eventCode: SmsPublishedBroadcastEvent) =>
  eventCode === 'MARKETPLACE_NEW_LISTING_PUBLISHED' ? 'CUSTOMER' as const : 'CANDIDATE' as const;
