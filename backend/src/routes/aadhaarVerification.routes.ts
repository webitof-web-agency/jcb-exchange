import { Router } from 'express';
import {
  cancelAadhaarVerification,
  completeAadhaarVerification,
  getAadhaarTemplate,
  getAadhaarVerificationHistory,
  getAadhaarVerificationDetail,
  getAadhaarVerificationStatus,
  initializeAadhaarVerification,
  uploadAadhaarTemplate,
} from '../controllers/aadhaarVerification.controller';
import {
  requireAdmin,
  requireAdminOrEmployeePermissions,
  requireAuth,
} from '../middlewares/auth.middleware';
import { surepassVerificationRateLimit } from '../middlewares/rateLimit.middleware';
import { getDocumentUploadMiddleware } from '../utils/documentUpload';

const router = Router();
const canVerify = requireAdminOrEmployeePermissions(['accounts.sell.crud', 'accounts.sell.update', 'aadhaar.digilocker.read']);
// HR staff verify an employee's Aadhaar from HRM and save its template; history stays with the existing roles.
const canVerifyForHrm = requireAdminOrEmployeePermissions(['accounts.sell.crud', 'accounts.sell.update', 'aadhaar.digilocker.read', 'hrm.documents.manage']);
const aadhaarTemplateUpload = getDocumentUploadMiddleware('secure');

router.use(requireAuth, requireAdmin);
router.post('/initialize', canVerifyForHrm, surepassVerificationRateLimit, initializeAadhaarVerification);
router.post('/complete', canVerifyForHrm, surepassVerificationRateLimit, completeAadhaarVerification);
router.post('/cancel', canVerifyForHrm, cancelAadhaarVerification);
router.get('/status/:id', canVerifyForHrm, getAadhaarVerificationStatus);
router.post('/:id/template', canVerifyForHrm, aadhaarTemplateUpload.single('template'), uploadAadhaarTemplate);
router.get('/:id/template', canVerifyForHrm, getAadhaarTemplate);
router.get('/history', canVerify, getAadhaarVerificationHistory);
router.get('/history/:id', canVerify, getAadhaarVerificationDetail);

export default router;
