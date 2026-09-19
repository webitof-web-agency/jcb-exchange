import { Router } from 'express';
import {
  getMarketplaceSmsAutomations,
  getRecruitmentSmsAutomations,
  getSmsConfiguration,
  getSmsDashboard,
  getSmsLogs,
  retrySmsLog,
  saveMarketplaceSmsAutomation,
  saveRecruitmentSmsAutomation,
  saveSmsConfiguration,
  sendSmsConfigurationTest,
} from '../controllers/sms.controller';
import { requireAuth, requireSuperAdminOrEmployeePermissions } from '../middlewares/auth.middleware';

const router = Router();
const canReadSms = requireSuperAdminOrEmployeePermissions(['sms.read', 'sms.manage']);
const canManageSms = requireSuperAdminOrEmployeePermissions(['sms.manage']);

router.use(requireAuth);
router.get('/dashboard', canReadSms, getSmsDashboard);
router.get('/settings', canReadSms, getSmsConfiguration);
router.put('/settings', canManageSms, saveSmsConfiguration);
router.post('/settings/test-message', canManageSms, sendSmsConfigurationTest);
router.get('/logs', canReadSms, getSmsLogs);
router.post('/logs/:id/retry', canManageSms, retrySmsLog);
router.get('/marketplace-automations', canReadSms, getMarketplaceSmsAutomations);
router.put('/marketplace-automations', canManageSms, saveMarketplaceSmsAutomation);
router.get('/recruitment-automations', canReadSms, getRecruitmentSmsAutomations);
router.put('/recruitment-automations', canManageSms, saveRecruitmentSmsAutomation);

export default router;
