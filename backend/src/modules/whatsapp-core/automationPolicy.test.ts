import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateWhatsAppAutomation, isWhatsAppDeliveryAllowed, normalizeWhatsAppRecipientPhone } from './automationPolicy';

test('blocks all WhatsApp delivery while the global integration toggle is off', () => {
  assert.equal(isWhatsAppDeliveryAllowed({ integrationEnabled: false, credentialsConfigured: true }), false);
  assert.equal(isWhatsAppDeliveryAllowed({ integrationEnabled: true, credentialsConfigured: false }), false);
  assert.equal(isWhatsAppDeliveryAllowed({ integrationEnabled: true, credentialsConfigured: true }), true);
});

test('queues an approved and enabled automation with a recipient', () => {
  const result = evaluateWhatsAppAutomation({
    integrationEnabled: true,
    recipientPhone: '+91 98765 43210',
    rule: { enabled: true, templateId: 'template-1', templateStatus: 'APPROVED', metaTemplateId: 'meta-template' },
  });

  assert.deepEqual(result, {
    shouldQueue: true,
    recipientPhone: '919876543210',
  });
});

test('does not queue automation until an approved template is selected', () => {
  const result = evaluateWhatsAppAutomation({
    integrationEnabled: true,
    recipientPhone: '919876543210',
    rule: { enabled: true, templateId: 'template-1', templateStatus: 'DRAFT', metaTemplateId: null },
  });

  assert.deepEqual(result, { shouldQueue: false, reason: 'APPROVED_TEMPLATE_REQUIRED' });
});

test('does not queue automation when integration or event rule is disabled', () => {
  assert.deepEqual(evaluateWhatsAppAutomation({
    integrationEnabled: false,
    recipientPhone: '919876543210',
    rule: { enabled: true, templateId: 'template-1', templateStatus: 'APPROVED', metaTemplateId: 'meta-template' },
  }), { shouldQueue: false, reason: 'INTEGRATION_DISABLED' });

  assert.deepEqual(evaluateWhatsAppAutomation({
    integrationEnabled: true,
    recipientPhone: '919876543210',
    rule: { enabled: false, templateId: 'template-1', templateStatus: 'APPROVED', metaTemplateId: 'meta-template' },
  }), { shouldQueue: false, reason: 'AUTOMATION_DISABLED' });
});

test('Indian 10-digit mobiles get the 91 country code Meta requires', () => {
  assert.equal(normalizeWhatsAppRecipientPhone('9174786123'), '919174786123');
  assert.equal(normalizeWhatsAppRecipientPhone('09174786123'), '919174786123');
  assert.equal(normalizeWhatsAppRecipientPhone('+91 91747 86123'), '919174786123');
  assert.equal(normalizeWhatsAppRecipientPhone('919174786123'), '919174786123');
  assert.equal(normalizeWhatsAppRecipientPhone('14155550123'), '14155550123');
  assert.equal(normalizeWhatsAppRecipientPhone('12345'), null);
  assert.equal(normalizeWhatsAppRecipientPhone('1234567890'), null);
  assert.equal(normalizeWhatsAppRecipientPhone(null), null);
});
