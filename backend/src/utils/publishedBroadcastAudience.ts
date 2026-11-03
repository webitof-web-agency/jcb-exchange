export type PublishedBroadcastRecipient = {
  recipientType: 'CUSTOMER' | 'CANDIDATE';
  recipientPhone: string;
  sourceEntityType: 'USER' | 'CANDIDATE';
  sourceEntityId: string;
};

export const mergePublishedBroadcastRecipients = (
  groups: readonly (readonly PublishedBroadcastRecipient[])[],
): PublishedBroadcastRecipient[] => {
  const byPhone = new Map<string, PublishedBroadcastRecipient>();

  for (const group of groups) {
    for (const recipient of group) {
      if (!byPhone.has(recipient.recipientPhone)) {
        byPhone.set(recipient.recipientPhone, recipient);
      }
    }
  }

  return Array.from(byPhone.values());
};
