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
  const normRole = normalized(role);
  const normRequested = normalized(requestedStatus);
  if (normRole === 'PARTNER') {
    if (normRequested === 'DRAFT') {
      return 'DRAFT';
    }
    if (normRequested === 'SOLD') {
      return 'SOLD';
    }
    return 'PENDING_APPROVAL';
  }
  return normRequested;
};
