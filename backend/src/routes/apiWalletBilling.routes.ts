import { Router } from 'express';
import { getApiBillingSummary } from '../controllers/apiWalletBilling.controller';
import { requireAdminOrEmployeePermissions, requireAuth } from '../middlewares/auth.middleware';

const router = Router();

// Wallet balance and per-check prices are for staff who run paid verifications (or manage settings).
export const API_BILLING_VIEW_PERMISSIONS = ['pan.verification.read', 'pan.mobile-to-pan.read', 'gst.verification.read', 'aadhaar.digilocker.read', 'driving-license.verification.read', 'rc.owner-history.read', 'rc.challan.verification.read', 'rc.chassis-to-rc.read', 'rc.to-mobile.read', 'rc.mobile-number-check.read', 'settings.manage'];
router.use(requireAuth, requireAdminOrEmployeePermissions(API_BILLING_VIEW_PERMISSIONS));
router.get('/summary', getApiBillingSummary);

export default router;
