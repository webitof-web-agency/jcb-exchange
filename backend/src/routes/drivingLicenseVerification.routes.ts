import { Router } from 'express';
import {
  getDrivingLicenseVerificationDetail,
  getDrivingLicenseVerificationHistory,
  verifyDrivingLicense,
} from '../controllers/drivingLicenseVerification.controller';
import { requireAdmin, requireAdminOrEmployeePermissions, requireAuth } from '../middlewares/auth.middleware';

const router = Router();
const canView = requireAdminOrEmployeePermissions(['driving-license.verification.read']);

router.use(requireAuth, requireAdmin);
router.post('/verify', canView, verifyDrivingLicense);
router.get('/history', canView, getDrivingLicenseVerificationHistory);
router.get('/history/:id', canView, getDrivingLicenseVerificationDetail);

export default router;
