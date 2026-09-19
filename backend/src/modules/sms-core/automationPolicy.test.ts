import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateSmsAutomation, normalizeSmsRecipientPhone, renderSmsVariables, resolveSmsTestRecipientPhone } from './automationPolicy';

test('requires an enabled integration, event rule, message id, and recipient', () => {
  assert.deepEqual(evaluateSmsAutomation({
    integrationEnabled: true,
    recipientPhone: '+91 98765 43210',
    rule: { enabled: true, messageId: '111111' },
  }), { shouldQueue: true, recipientPhone: '9876543210' });
  assert.deepEqual(evaluateSmsAutomation({
    integrationEnabled: true,
    recipientPhone: '9876543210',
    rule: { enabled: true, messageId: '' },
  }), { shouldQueue: false, reason: 'MESSAGE_ID_REQUIRED' });
});

test('renders pipe-separated variable keys from event payloads', () => {
  assert.equal(normalizeSmsRecipientPhone('+91 98765 43210'), '9876543210');
  assert.equal(renderSmsVariables('customerName|listingTitle|Approved', {
    customerName: 'Rahul',
    listingTitle: 'JCB 3DX',
  }), 'Rahul|JCB 3DX|Approved');
});

test('keeps the saved test recipient when a settings form sends an untouched blank value', () => {
  assert.equal(resolveSmsTestRecipientPhone('', '9876543210'), '9876543210');
  assert.equal(resolveSmsTestRecipientPhone(undefined, '9876543210'), '9876543210');
  assert.equal(resolveSmsTestRecipientPhone('9123456789', '9876543210'), '9123456789');
});
