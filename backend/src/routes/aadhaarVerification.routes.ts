import { Router } from 'express';
import {
  cancelAadhaarVerification,
  completeAadhaarVerification,
  getAadhaarVerificationDetail,
  initializeAadhaarVerification,
} from '../controllers/aadhaarVerification.controller';
import {
  requireAdmin,
  requireAdminOrEmployeePermissions,
  requireAuth,
} from '../middlewares/auth.middleware';

const router = Router();
const canVerify = requireAdminOrEmployeePermissions(['accounts.sell.crud', 'accounts.sell.update']);

router.use(requireAuth, requireAdmin);
router.post('/initialize', canVerify, initializeAadhaarVerification);
router.post('/complete', canVerify, completeAadhaarVerification);
router.post('/cancel', canVerify, cancelAadhaarVerification);
router.get('/history/:id', canVerify, getAadhaarVerificationDetail);

export default router;
