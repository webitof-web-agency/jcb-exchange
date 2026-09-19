import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertWhatsAppTemplatePurpose,
  getWhatsAppReminderTemplatePurpose,
  isWhatsAppTemplatePurposeAllowed,
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
