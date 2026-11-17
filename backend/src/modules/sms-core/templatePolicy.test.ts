import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getMissingSmsTemplateVariables,
  getSmsTemplateVariableOptions,
  renderSmsVariables,
  validateSmsTemplateConfiguration,
  validateSmsTemplateVariableOrder,
} from './templatePolicy';

test('allows message-id-only templates without requiring variables', () => {
  assert.equal(validateSmsTemplateVariableOrder('LISTING_PAYMENT_APPROVED', ''), null);
  assert.deepEqual(getSmsTemplateVariableOptions('LISTING_PAYMENT_APPROVED').includes('listingTitle'), true);
});

test('accepts only event payload keys for variable templates', () => {
  assert.equal(
    validateSmsTemplateVariableOrder('LISTING_PAYMENT_APPROVED', 'listingTitle|status'),
    'listingTitle|status',
  );
  assert.throws(
    () => validateSmsTemplateVariableOrder('LISTING_PAYMENT_APPROVED', 'customerPassword'),
    /Unsupported SMS template variable: customerPassword/,
  );
});

test('detects missing runtime values before sending to the provider', () => {
  assert.deepEqual(
    getMissingSmsTemplateVariables('customerName|listingTitle|status', {
      customerName: 'Aman',
      listingTitle: '',
      status: 'APPROVED',
    }),
    ['listingTitle'],
  );
  assert.equal(renderSmsVariables('customerName|status', { customerName: 'Aman', status: 'APPROVED' }), 'Aman|APPROVED');
});

test('requires the complete payment receipt variable order when the SMS rule is enabled', () => {
  assert.throws(
    () => validateSmsTemplateConfiguration('VEHICLE_SALE_PAYMENT_RECEIPT', true, 'customerName|amount|receiptUrl'),
    /must use this exact variable order/,
  );
  assert.equal(
    validateSmsTemplateConfiguration(
      'VEHICLE_SALE_PAYMENT_RECEIPT',
      true,
      'customerName|vehicleTitle|amount|receiptNumber|balance|paymentMethod|receiptUrl',
    ),
    'customerName|vehicleTitle|amount|receiptNumber|balance|paymentMethod|receiptUrl',
  );
});
