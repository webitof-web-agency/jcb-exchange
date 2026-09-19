import { Router } from 'express';
import {
  getWhatsAppConfiguration,
  getWhatsAppCampaigns,
  getWhatsAppDashboard,
  getWhatsAppLogs,
  getWhatsAppTemplates,
  getMarketplaceWhatsAppAutomations,
  getRecruitmentWhatsAppAutomations,
  saveWhatsAppConfiguration,
  saveWhatsAppCampaignConsent,
  saveMarketplaceWhatsAppAutomation,
  saveRecruitmentWhatsAppAutomation,
  saveMarketplaceWhatsAppTemplate,
  sendWhatsAppConfigurationTest,
  retryWhatsAppLog,
  createWhatsAppCampaignDraft,
  createWhatsAppReminderCampaignDraft,
  confirmWhatsAppCampaignDraft,
} from '../controllers/whatsapp.controller';
import { requireAuth, requireSuperAdminOrEmployeePermissions } from '../middlewares/auth.middleware';

const router = Router();
const canReadWhatsApp = requireSuperAdminOrEmployeePermissions(['whatsapp.read', 'whatsapp.manage']);
const canManageWhatsApp = requireSuperAdminOrEmployeePermissions(['whatsapp.manage']);

router.use(requireAuth);
router.get('/dashboard', canReadWhatsApp, getWhatsAppDashboard);
router.get('/settings', canReadWhatsApp, getWhatsAppConfiguration);
router.put('/settings', canManageWhatsApp, saveWhatsAppConfiguration);
router.post('/settings/test-message', canManageWhatsApp, sendWhatsAppConfigurationTest);
router.get('/logs', canReadWhatsApp, getWhatsAppLogs);
router.post('/logs/:id/retry', canManageWhatsApp, retryWhatsAppLog);
router.get('/templates', canReadWhatsApp, getWhatsAppTemplates);
router.get('/campaigns', canReadWhatsApp, getWhatsAppCampaigns);
router.post('/campaign-consents', canManageWhatsApp, saveWhatsAppCampaignConsent);
router.post('/campaigns', canManageWhatsApp, createWhatsAppCampaignDraft);
router.post('/campaign-reminders', canManageWhatsApp, createWhatsAppReminderCampaignDraft);
router.post('/campaigns/:id/confirm', canManageWhatsApp, confirmWhatsAppCampaignDraft);
router.get('/marketplace-automations', canReadWhatsApp, getMarketplaceWhatsAppAutomations);
router.post('/marketplace-templates', canManageWhatsApp, saveMarketplaceWhatsAppTemplate);
router.put('/marketplace-automations', canManageWhatsApp, saveMarketplaceWhatsAppAutomation);
router.get('/recruitment-automations', canReadWhatsApp, getRecruitmentWhatsAppAutomations);
router.put('/recruitment-automations', canManageWhatsApp, saveRecruitmentWhatsAppAutomation);

export default router;
