import { Router } from 'express';
import {
  getRcToMobileHistory,
  getRcToMobileHistoryDetail,
  verifyRcToMobile,
} from '../controllers/rcToMobileVerification.controller';
import { requireAdmin, requireAdminOrEmployeePermissions, requireAuth } from '../middlewares/auth.middleware';
import { surepassVerificationRateLimit } from '../middlewares/rateLimit.middleware';

const router = Router();
const canView = requireAdminOrEmployeePermissions(['rc.to-mobile.read']);

router.use(requireAuth, requireAdmin);
router.post('/verify', canView, surepassVerificationRateLimit, verifyRcToMobile);
router.get('/history', canView, getRcToMobileHistory);
router.get('/history/:id', canView, getRcToMobileHistoryDetail);

export default router;
