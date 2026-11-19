import assert from 'node:assert/strict';
import test from 'node:test';
import { CRM_WHATSAPP_TEMPLATE_CONTRACTS } from './crmWhatsAppTemplateContracts';

test('defines the four marked CRM WhatsApp template contracts', () => {
  assert.deepEqual(CRM_WHATSAPP_TEMPLATE_CONTRACTS, {
    CRM_LEAD_ASSIGNED: {
      name: 'marketplace_crm_lead_assigned', language: 'en_US', category: 'MARKETPLACE',
      body: 'Hello {{1}},\n\nA new lead has been assigned to you.\nCustomer: {{2}}\nMobile: {{3}}\nEnquiry: {{4}}\n\nPlease open CRM to follow up.\n\nJCB Exchange.', footer: 'JCB Exchange', bodyVariableCount: 4,
    },
    CRM_FOLLOW_UP_REMINDER: {
      name: 'marketplace_crm_follow_up_reminder', language: 'en_US', category: 'MARKETPLACE',
      body: 'Hello {{1}},\n\nFollow-up reminder for {{2}}.\nType: {{3}}\nDue: {{4}}\nCustomer mobile: {{5}}\n\nPlease update CRM after contact.\n\nJCB Exchange.', footer: 'JCB Exchange', bodyVariableCount: 5,
    },
    CRM_APPOINTMENT_REMINDER: {
      name: 'marketplace_crm_appointment_reminder', language: 'en_US', category: 'MARKETPLACE',
      body: 'Hello {{1}},\n\nReminder: your {{2}} is scheduled for {{3}}.\n\nPlease be available.\n\nJCB Exchange.', footer: 'JCB Exchange', bodyVariableCount: 3,
    },
    CRM_MATCHING_LISTING: {
      name: 'marketplace_crm_matching_listing', language: 'en_US', category: 'MARKETPLACE',
      body: 'Hello {{1}},\n\nA matching JCB machine is available.\nVehicle: {{2}}\nPrice: {{3}}\n\nView listing: {{4}}\n\nJCB Exchange.', footer: 'JCB Exchange', bodyVariableCount: 4,
    },
  });
});
