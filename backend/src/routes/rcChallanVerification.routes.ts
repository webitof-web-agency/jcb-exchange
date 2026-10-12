import { Router } from 'express';
import {
  getRcChallanVerificationDetail,
  getRcChallanVerificationHistory,
  verifyRcChallan,
} from '../controllers/rcChallanVerification.controller';
import { requireAdmin, requireAdminOrEmployeePermissions, requireAuth } from '../middlewares/auth.middleware';

const router = Router();
const canView = requireAdminOrEmployeePermissions(['rc.challan.verification.read']);

router.use(requireAuth, requireAdmin);
router.post('/verify', canView, verifyRcChallan);
router.get('/history', canView, getRcChallanVerificationHistory);
router.get('/history/:id', canView, getRcChallanVerificationDetail);

export default router;
