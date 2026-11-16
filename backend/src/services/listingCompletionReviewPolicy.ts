type CompletionReviewInput = {
  listingStatus: unknown;
  inviteStatus: unknown;
};

const normalized = (value: unknown) => String(value || '').trim().toUpperCase();

export const isCompletionWaitingForPartnerReview = ({ listingStatus, inviteStatus }: CompletionReviewInput) =>
  normalized(listingStatus) === 'DRAFT' && normalized(inviteStatus) === 'SUBMITTED';

export const canSubmitCompletionForPartnerReview = isCompletionWaitingForPartnerReview;

export const normalizePartnerDraftSubmissionStatus = ({ role, currentStatus, requestedStatus }: {
  role: unknown;
  currentStatus: unknown;
  requestedStatus: unknown;
}) => {
  if (normalized(role) === 'PARTNER' && normalized(currentStatus) === 'DRAFT' && normalized(requestedStatus) === 'PUBLISHED') {
    return 'PENDING_APPROVAL';
  }
  return normalized(requestedStatus);
};
