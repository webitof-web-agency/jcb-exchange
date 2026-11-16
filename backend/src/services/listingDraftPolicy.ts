type ListingDraftRequest = {
  role: string;
  status: unknown;
  saveAsDraft: unknown;
};

/**
 * Drafts are an explicit partner-only workflow. A client cannot turn an
 * ordinary listing submission into a hidden draft by merely changing status.
 */
export const isPartnerListingDraftSave = ({ role, status, saveAsDraft }: ListingDraftRequest) =>
  role === 'PARTNER' && saveAsDraft === true && String(status || '').trim().toUpperCase() === 'DRAFT';
