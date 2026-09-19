import { Router } from 'express';
import {
  createListing,
  deleteListing,
  getListingById,
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
  updateListingAvailability,
} from '../controllers/listing.controller';
import { requireAuth, requireAdmin } from '../middlewares/auth.middleware';

const router = Router();

router.post('/', requireAuth, createListing);
router.get('/', requireAuth, getListings);
router.get('/payment-submissions/customer', requireAuth, getCustomerListingPaymentSubmissions);
router.get('/payment-submissions/partner', requireAuth, getPartnerListingPaymentSubmissions);
router.get('/:id/payment-settings', requireAuth, getListingPaymentSettings);
router.post('/:id/razorpay-order', requireAuth, createListingRazorpayOrder);
router.post('/:id/phonepe-order', requireAuth, createListingPhonePeOrder);
router.post('/:id/phonepe-status', requireAuth, verifyListingPhonePeOrder);
router.post('/:id/payment-submissions', requireAuth, submitListingPayment);
router.get('/:id', requireAuth, getListingById);
router.put('/:id', requireAuth, updateListing);
router.delete('/:id', requireAuth, deleteListing);
router.patch('/:id/status', requireAuth, requireAdmin, updateListingStatus);
router.patch('/:id/availability', requireAuth, updateListingAvailability);

export default router;
