const text = (value) => (typeof value === 'string' ? value.trim() : '');

export const createSellAccountDraftId = (listingId, timestamp = Date.now()) => {
  const normalizedListingId = text(listingId);
  return normalizedListingId ? `DRAFT-SELL-${normalizedListingId}` : `DRAFT-SELL-${timestamp}`;
};

export const isSellAccountDraft = (record = {}) => record?.isDraft === true || record?.status === 'DRAFT';

export const mergeSellAccountRecords = (serverRecords = [], localRecords = []) => {
  const serverIds = new Set(serverRecords.map((record) => text(record?.id)).filter(Boolean));
  const serverListingIds = new Set(
    serverRecords.map((record) => text(record?.listingId)).filter(Boolean),
  );

  // A successful API response is authoritative. Only unsynced drafts may be
  // kept locally; ordinary local records must not resurrect after a permanent
  // database deletion from another screen or device.
  const localRecordsNotOnServer = localRecords.filter((record) => {
    if (!isSellAccountDraft(record)) return false;
    const id = text(record?.id);
    const listingId = text(record?.listingId);
    return (!id || !serverIds.has(id)) && (!listingId || !serverListingIds.has(listingId));
  });

  return [...serverRecords, ...localRecordsNotOnServer];
};
