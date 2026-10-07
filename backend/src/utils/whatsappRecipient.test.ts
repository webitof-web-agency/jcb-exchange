import assert from 'node:assert/strict';
import test from 'node:test';
import { getPreferredWhatsAppNumber } from './whatsappRecipient';

test('prefers a saved WhatsApp number over the mobile number', () => {
  assert.equal(getPreferredWhatsAppNumber('8109912840', '3242342342'), '8109912840');
});

test('falls back to mobile when WhatsApp number is missing', () => {
  assert.equal(getPreferredWhatsAppNumber(null, '3242342342'), '3242342342');
});

test('returns null when neither contact number exists', () => {
  assert.equal(getPreferredWhatsAppNumber('', null), null);
});
