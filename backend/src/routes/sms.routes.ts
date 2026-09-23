import { Router } from 'express';
import {
  clearSmsLogs,
  deleteSmsLog,
  getMarketplaceSmsAutomations,
  getRecruitmentSmsAutomations,
  getSmsConfiguration,
  getSmsDashboard,
  getSmsLogs,
  retrySmsLog,
  revealSmsApiKeyValue,
  saveMarketplaceSmsAutomation,
  saveRecruitmentSmsAutomation,
  saveSmsConfiguration,
  sendSmsConfigurationTest,
} from '../controllers/sms.controller';
import { requireAuth, requireSuperAdmin, requireSuperAdminOrEmployeePermissions } from '../middlewares/auth.middleware';

const router = Router();
const canReadSms = requireSuperAdminOrEmployeePermissions(['sms.read', 'sms.manage']);
const canManageSms = requireSuperAdminOrEmployeePermissions(['sms.manage']);

router.use(requireAuth);
router.get('/dashboard', canReadSms, getSmsDashboard);
router.get('/settings', canReadSms, getSmsConfiguration);
router.get('/settings/api-key', requireSuperAdmin, revealSmsApiKeyValue);
router.put('/settings', canManageSms, saveSmsConfiguration);
router.post('/settings/test-message', canManageSms, sendSmsConfigurationTest);
router.get('/logs', canReadSms, getSmsLogs);
router.delete('/logs/clear', canManageSms, clearSmsLogs);
router.delete('/logs/:id', canManageSms, deleteSmsLog);
router.post('/logs/:id/retry', canManageSms, retrySmsLog);
router.get('/marketplace-automations', canReadSms, getMarketplaceSmsAutomations);
router.put('/marketplace-automations', canManageSms, saveMarketplaceSmsAutomation);
router.get('/recruitment-automations', canReadSms, getRecruitmentSmsAutomations);
router.put('/recruitment-automations', canManageSms, saveRecruitmentSmsAutomation);

export default router;
