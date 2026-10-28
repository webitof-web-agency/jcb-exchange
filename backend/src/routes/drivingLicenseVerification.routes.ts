import { Router } from 'express';
import {
  getDrivingLicenseVerificationDetail,
  getDrivingLicenseVerificationHistory,
  getDrivingLicenseTemplate,
  uploadDrivingLicenseTemplate,
  verifyDrivingLicense,
} from '../controllers/drivingLicenseVerification.controller';
import { requireAdmin, requireAdminOrEmployeePermissions, requireAuth } from '../middlewares/auth.middleware';
import { getDocumentUploadMiddleware } from '../utils/documentUpload';

const router = Router();
const canView = requireAdminOrEmployeePermissions(['driving-license.verification.read']);
const drivingLicenseTemplateUpload = getDocumentUploadMiddleware('secure');

router.use(requireAuth, requireAdmin);
router.post('/verify', canView, verifyDrivingLicense);
router.post('/:id/template', canView, drivingLicenseTemplateUpload.single('template'), uploadDrivingLicenseTemplate);
router.get('/:id/template', canView, getDrivingLicenseTemplate);
router.get('/history', canView, getDrivingLicenseVerificationHistory);
router.get('/history/:id', canView, getDrivingLicenseVerificationDetail);

export default router;
