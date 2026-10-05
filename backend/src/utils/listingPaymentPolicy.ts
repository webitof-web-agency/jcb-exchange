export type ListingPaymentMethod = 'RTGS' | 'RAZORPAY' | 'PHONEPE';

export type ListingPaymentOutcome = {
  status: 'PENDING_VERIFICATION' | 'PAID';
  requiresManualReview: boolean;
};

export const getListingPaymentOutcome = (_method: ListingPaymentMethod): ListingPaymentOutcome => ({
  status: 'PAID',
  requiresManualReview: false,
});
