import { Router } from 'express';
import {
  getEmailConfiguration,
  getEmailDeliveryLogs,
  saveEmailConfiguration,
  sendEmailConfigurationTest,
  testEmailConnection,
  retryEmailDelivery,
} from '../controllers/email.controller';
import { requireAdminOrEmployeePermissions, requireAuth } from '../middlewares/auth.middleware';

const router = Router();
const canReadEmail = requireAdminOrEmployeePermissions(['email.read', 'email.manage']);
const canManageEmail = requireAdminOrEmployeePermissions(['email.manage']);

router.use(requireAuth);
router.get('/settings', canReadEmail, getEmailConfiguration);
router.get('/logs', canReadEmail, getEmailDeliveryLogs);
router.put('/settings', canManageEmail, saveEmailConfiguration);
router.post('/settings/test-connection', canManageEmail, testEmailConnection);
router.post('/settings/test-email', canManageEmail, sendEmailConfigurationTest);
router.post('/logs/:id/retry', canManageEmail, retryEmailDelivery);

export default router;
