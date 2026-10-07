import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertWhatsAppTemplatePurpose,
  getWhatsAppReminderTemplatePurpose,
  isWhatsAppTemplatePurposeAllowed,
  resolveWhatsAppTemplatePurpose,
} from './templatePurposePolicy';

test('allows dropdown templates only for the matching WhatsApp module purpose', () => {
  assert.equal(isWhatsAppTemplatePurposeAllowed('MARKETPLACE', ['MARKETPLACE']), true);
  assert.equal(isWhatsAppTemplatePurposeAllowed('RECRUITMENT', ['MARKETPLACE']), false);
  assert.equal(isWhatsAppTemplatePurposeAllowed('MARKETING', ['JOB_ALERTS']), false);
});

test('maps reminder dropdowns to the right template purpose', () => {
  assert.equal(getWhatsAppReminderTemplatePurpose('INTERVIEW_48_HOURS'), 'JOB_ALERTS');
  assert.equal(getWhatsAppReminderTemplatePurpose('PRIME_EXPIRY_7_DAYS'), 'MARKETING');
});

test('rejects unknown WhatsApp template purpose values', () => {
  assert.equal(assertWhatsAppTemplatePurpose('RECRUITMENT'), 'RECRUITMENT');
  assert.throws(() => assertWhatsAppTemplatePurpose('UTILITY'), /valid WhatsApp template purpose/);
});

test('infers automation purpose from prefixed template names when Meta returns GENERAL', () => {
  assert.equal(resolveWhatsAppTemplatePurpose('marketplace_payment_update', 'GENERAL'), 'MARKETPLACE');
  assert.equal(resolveWhatsAppTemplatePurpose('recruitment_offer_sent', 'GENERAL'), 'RECRUITMENT');
});

test('keeps valid explicit campaign purposes for non-prefixed templates', () => {
  assert.equal(resolveWhatsAppTemplatePurpose('prime_offer', 'MARKETING'), 'MARKETING');
  assert.equal(resolveWhatsAppTemplatePurpose('unknown_template', 'GENERAL'), null);
});
