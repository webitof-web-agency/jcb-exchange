import assert from 'node:assert/strict';
import test from 'node:test';
import { canRegisterWhatsAppTemplate, validateWhatsAppTemplateForm } from './whatsappTemplateName.mjs';

test('does not allow the blank registration form to be submitted', () => {
  assert.equal(
    canRegisterWhatsAppTemplate({ name: '', language: 'en_US', status: 'APPROVED', metaTemplateId: '' }),
    false,
  );
});

test('allows registration only when the complete approved template contract is present', () => {
  assert.equal(
    canRegisterWhatsAppTemplate({
      name: 'marketplace_vehicle_payment_receipt',
      language: 'en_US',
      status: 'APPROVED',
      metaTemplateId: '1234567890',
    }),
    true,
  );
});

test('accepts an approved Meta template with a valid name and id', () => {
  assert.equal(
    validateWhatsAppTemplateForm({
      name: 'marketplace_vehicle_payment_receipt',
      language: 'en_US',
      status: 'APPROVED',
      metaTemplateId: '1234567890',
    }),
    null,
  );
});

test('rejects template names that Meta cannot accept', () => {
  for (const name of ['', 'Vehicle Receipt', 'vehicle-receipt', 'Vehicle_Receipt']) {
    assert.equal(
      validateWhatsAppTemplateForm({ name, language: 'en_US', status: 'APPROVED', metaTemplateId: '1234567890' }),
      'Template name must contain lowercase letters, numbers, and underscores only.',
    );
  }
});

test('requires a Meta template id before registering an approved template', () => {
  assert.equal(
    validateWhatsAppTemplateForm({
      name: 'marketplace_listing_approved',
      language: 'en_US',
      status: 'APPROVED',
      metaTemplateId: '  ',
    }),
    'An approved template requires its Meta template ID.',
  );
});
