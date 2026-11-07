export type PartnerDecisionStatus = 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED';

export type PartnerReviewEvent = {
  id: string;
  action: string;
  comment: string | null;
  createdAt: string;
};

export type PartnerDecision = PartnerReviewEvent & {
  status: PartnerDecisionStatus;
};

const decisionActionStatus: Record<string, PartnerDecisionStatus> = {
  SUPER_ADMIN_APPROVED: 'APPROVED',
  SUPER_ADMIN_REJECTED: 'REJECTED',
  SUPER_ADMIN_CHANGES_REQUESTED: 'CHANGES_REQUESTED',
};

export const getLatestPartnerDecision = (
  reviewHistory: PartnerReviewEvent[],
): PartnerDecision | null => {
  const decisions = reviewHistory
    .map((review) => {
      const status = decisionActionStatus[review.action];
      return status ? { ...review, status } : null;
    })
    .filter((review): review is PartnerDecision => Boolean(review));

  return decisions.sort(
    (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  )[0] || null;
};

export const getPartnerDecisionRemark = (decision: PartnerDecision): string => {
  const comment = decision.comment?.trim();
  if (comment) {
    return comment;
  }

  if (decision.status === 'APPROVED') {
    return 'Account approved and activated after successful compliance review. No additional remarks were added.';
  }

  if (decision.status === 'CHANGES_REQUESTED') {
    return 'Please review the requested corrections and submit the updated information for another compliance review.';
  }

  return 'The submitted partner dossier was not approved. Please contact support for further assistance.';
};

export const getPartnerDecisionLabel = (status: PartnerDecisionStatus): string => {
  if (status === 'APPROVED') return 'Approved & Activated';
  if (status === 'CHANGES_REQUESTED') return 'Changes Requested';
  return 'Not Approved';
};
