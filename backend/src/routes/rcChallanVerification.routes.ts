import { Router } from 'express';
import {
  getRcChallanVerificationDetail,
  getRcChallanVerificationHistory,
  verifyRcChallan,
} from '../controllers/rcChallanVerification.controller';
import { requireAdmin, requireAdminOrEmployeePermissions, requireAuth } from '../middlewares/auth.middleware';
import { surepassVerificationRateLimit } from '../middlewares/rateLimit.middleware';

const router = Router();
const canView = requireAdminOrEmployeePermissions(['rc.challan.verification.read']);

router.use(requireAuth, requireAdmin);
router.post('/verify', canView, surepassVerificationRateLimit, verifyRcChallan);
router.get('/history', canView, getRcChallanVerificationHistory);
router.get('/history/:id', canView, getRcChallanVerificationDetail);

export default router;
