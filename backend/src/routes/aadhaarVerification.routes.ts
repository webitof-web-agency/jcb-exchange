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
const aadhaarTemplateUpload = getDocumentUploadMiddleware('secure');

router.use(requireAuth, requireAdmin);
router.post('/initialize', canVerify, surepassVerificationRateLimit, initializeAadhaarVerification);
router.post('/complete', canVerify, surepassVerificationRateLimit, completeAadhaarVerification);
router.post('/cancel', canVerify, cancelAadhaarVerification);
router.get('/status/:id', canVerify, getAadhaarVerificationStatus);
router.post('/:id/template', canVerify, aadhaarTemplateUpload.single('template'), uploadAadhaarTemplate);
router.get('/:id/template', canVerify, getAadhaarTemplate);
router.get('/history', canVerify, getAadhaarVerificationHistory);
router.get('/history/:id', canVerify, getAadhaarVerificationDetail);

export default router;
