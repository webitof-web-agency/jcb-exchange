import { Router } from 'express';
import {
  checkListingVehicleIdentity,
  createListing,
  deleteListing,
  getListingDeleteImpact,
  moderateListingHandler,
  getListingById,
  getListingVerificationPolicy,
  getListings,
  getListingPaymentSettings,
  getCustomerListingPaymentSubmissions,
  getPartnerListingPaymentSubmissions,
  createListingRazorpayOrder,
  createListingPhonePeOrder,
  verifyListingPhonePeOrder,
  submitListingPayment,
  updateListing,
  updateListingStatus,
  updateListingPricing,
  updateListingAvailability,
} from '../controllers/listing.controller';
import { verifyRcFullForListing } from '../controllers/rcFull.controller';
import { requireAuth, requireAdmin } from '../middlewares/auth.middleware';
import { listingRcLookupRateLimit, surepassVerificationRateLimit, vehicleIdentityCheckRateLimit } from '../middlewares/rateLimit.middleware';

const router = Router();

router.post('/', requireAuth, createListing);
router.get('/', requireAuth, getListings);
router.get('/verification-policy', requireAuth, getListingVerificationPolicy);
router.get('/vehicle-identity-check', requireAuth, vehicleIdentityCheckRateLimit, checkListingVehicleIdentity);
router.post('/vehicle-verification/rc-full', requireAuth, listingRcLookupRateLimit, surepassVerificationRateLimit, verifyRcFullForListing);
router.get('/payment-submissions/customer', requireAuth, getCustomerListingPaymentSubmissions);
router.get('/payment-submissions/partner', requireAuth, getPartnerListingPaymentSubmissions);
router.get('/:id/payment-settings', requireAuth, getListingPaymentSettings);
router.post('/:id/razorpay-order', requireAuth, createListingRazorpayOrder);
router.post('/:id/phonepe-order', requireAuth, createListingPhonePeOrder);
router.post('/:id/phonepe-status', requireAuth, verifyListingPhonePeOrder);
router.post('/:id/payment-submissions', requireAuth, submitListingPayment);
router.get('/:id', requireAuth, getListingById);
router.put('/:id', requireAuth, updateListing);
router.get('/:id/delete-impact', requireAuth, getListingDeleteImpact);
router.delete('/:id', requireAuth, deleteListing);
router.patch('/:id/status', requireAuth, requireAdmin, updateListingStatus);
router.patch('/:id/pricing', requireAuth, requireAdmin, updateListingPricing);
router.patch('/:id/availability', requireAuth, updateListingAvailability);
router.patch('/:id/moderation', requireAuth, moderateListingHandler);

export default router;
