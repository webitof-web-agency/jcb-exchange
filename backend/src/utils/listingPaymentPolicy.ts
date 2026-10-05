export type ListingPaymentMethod = 'RTGS' | 'RAZORPAY' | 'PHONEPE';

export type ListingPaymentOutcome = {
  status: 'PENDING_VERIFICATION' | 'PAID';
  requiresManualReview: boolean;
};

export const getListingPaymentOutcome = (method: ListingPaymentMethod): ListingPaymentOutcome =>
  method === 'RTGS'
    ? {
      status: 'PENDING_VERIFICATION',
      requiresManualReview: true,
    }
    : {
      status: 'PAID',
      requiresManualReview: false,
    };
