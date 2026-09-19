import assert from 'node:assert/strict';
import test from 'node:test';
import { getWhatsAppReminderDefinition } from './reminderPolicy';

test('maps an interview reminder to job-alert consent and a 48-hour window', () => {
  assert.deepEqual(getWhatsAppReminderDefinition('INTERVIEW_48_HOURS'), {
    category: 'JOB_ALERTS',
    recipientType: 'CANDIDATE',
    title: 'Interview reminder · next 48 hours',
  });
});

test('maps a Prime expiry reminder to marketing consent and customer recipients', () => {
  assert.deepEqual(getWhatsAppReminderDefinition('PRIME_EXPIRY_7_DAYS'), {
    category: 'MARKETING',
    recipientType: 'CUSTOMER',
    title: 'Prime expiry reminder · next 7 days',
  });
});

test('uses the selected custom reminder window in the reminder title', () => {
  assert.equal(getWhatsAppReminderDefinition('INTERVIEW_48_HOURS', 72).title, 'Interview reminder · next 72 hours');
  assert.equal(getWhatsAppReminderDefinition('PRIME_EXPIRY_7_DAYS', 14).title, 'Prime expiry reminder · next 14 days');
});
