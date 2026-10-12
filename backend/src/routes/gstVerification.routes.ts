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

router.use(requireAuth, requireAdmin);
router.post('/verify', canView, verifyGstin);
router.get('/history', canView, getGstVerificationHistory);
router.get('/history/:id', canView, getGstVerificationDetail);

export default router;
