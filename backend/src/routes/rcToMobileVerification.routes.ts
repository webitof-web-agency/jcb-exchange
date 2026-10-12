import { Router } from 'express';
import {
  getRcToMobileHistory,
  getRcToMobileHistoryDetail,
  verifyRcToMobile,
} from '../controllers/rcToMobileVerification.controller';
import { requireAdmin, requireAdminOrEmployeePermissions, requireAuth } from '../middlewares/auth.middleware';

const router = Router();
const canView = requireAdminOrEmployeePermissions(['rc.to-mobile.read']);

router.use(requireAuth, requireAdmin);
router.post('/verify', canView, verifyRcToMobile);
router.get('/history', canView, getRcToMobileHistory);
router.get('/history/:id', canView, getRcToMobileHistoryDetail);

export default router;
