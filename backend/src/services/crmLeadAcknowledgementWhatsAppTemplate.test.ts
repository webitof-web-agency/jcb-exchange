import assert from 'node:assert/strict';
import test from 'node:test';
import { CRM_LEAD_ACKNOWLEDGEMENT_WHATSAPP_TEMPLATE } from './crmLeadAcknowledgementWhatsAppTemplate';

test('defines the Meta template contract used by CRM lead acknowledgement', () => {
  assert.deepEqual(CRM_LEAD_ACKNOWLEDGEMENT_WHATSAPP_TEMPLATE, {
    name: 'marketplace_crm_lead_acknowledgement',
    language: 'en_US',
    category: 'MARKETPLACE',
    body: 'Hello {{1}},\n\nThank you for contacting JCB Exchange.\nWe have received your enquiry about {{2}}.\nOur team will contact you shortly.\n\nThank you for choosing JCB Exchange.',
    footer: 'JCB Exchange',
    bodyVariableCount: 2,
  });
});
