import { Router } from 'express';
import {
  getGstVerificationDetail,
  getGstVerificationHistory,
  verifyGstin,
} from '../controllers/gstVerification.controller';
import {
  requireAdmin,
  requireAdminOrEmployeePermissions,
  requireAuth,
} from '../middlewares/auth.middleware';

const router = Router();
const canView = requireAdminOrEmployeePermissions(['gst.verification.read']);
const canVerifyForKycEdit = requireAdminOrEmployeePermissions(['gst.verification.read', 'kyc.edit.override']);

router.use(requireAuth, requireAdmin);
router.post('/verify', canVerifyForKycEdit, verifyGstin);
router.get('/history', canView, getGstVerificationHistory);
router.get('/history/:id', canView, getGstVerificationDetail);

export default router;
