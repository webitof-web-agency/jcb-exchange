import { Router } from 'express';
import {
  getEmailConfiguration,
  getEmailDeliveryLogs,
  saveEmailConfiguration,
  sendEmailConfigurationTest,
  testEmailConnection,
} from '../controllers/email.controller';
import { requireAuth, requireSuperAdminOrEmployeePermissions } from '../middlewares/auth.middleware';

const router = Router();
const canReadEmail = requireSuperAdminOrEmployeePermissions(['email.read', 'email.manage']);
const canManageEmail = requireSuperAdminOrEmployeePermissions(['email.manage']);

router.use(requireAuth);
router.get('/settings', canReadEmail, getEmailConfiguration);
router.get('/logs', canReadEmail, getEmailDeliveryLogs);
router.put('/settings', canManageEmail, saveEmailConfiguration);
router.post('/settings/test-connection', canManageEmail, testEmailConnection);
router.post('/settings/test-email', canManageEmail, sendEmailConfigurationTest);

export default router;
