import { Router } from 'express';
import {
  getChassisToRcHistory,
  getChassisToRcHistoryDetail,
  verifyChassisToRc,
} from '../controllers/chassisToRcVerification.controller';
import { requireAdmin, requireAdminOrEmployeePermissions, requireAuth } from '../middlewares/auth.middleware';

const router = Router();
const canView = requireAdminOrEmployeePermissions(['rc.chassis-to-rc.read']);

router.use(requireAuth);
// Vehicle sellers must be able to verify their own chassis before submitting a listing.
// History remains restricted to portal operators because it contains sensitive RC data.
router.post('/verify', verifyChassisToRc);
router.use(requireAdmin);
router.get('/history', canView, getChassisToRcHistory);
router.get('/history/:id', canView, getChassisToRcHistoryDetail);

export default router;
