import assert from 'node:assert/strict';
import test from 'node:test';
import { marketplaceSmsEvents, recruitmentSmsEvents } from './smsIntegration.service';
import { getSmsTemplateVariableOptions } from '../modules/sms-core/templatePolicy';

test('registers the public marketplace SMS automation event', () => {
  assert.equal(marketplaceSmsEvents.includes('MARKETPLACE_NEW_LISTING_PUBLISHED'), true);
});

test('registers the public recruitment SMS automation event', () => {
  assert.equal(recruitmentSmsEvents.includes('RECRUITMENT_NEW_JOB_PUBLISHED'), true);
});

test('registers the offer accepted and joining SMS events', () => {
  for (const eventCode of [
    'RECRUITMENT_OFFER_ACCEPTED',
    'RECRUITMENT_OFFER_ACCEPTED_HR',
    'RECRUITMENT_JOINING_REMINDER',
    'RECRUITMENT_JOINING_WELCOME',
  ] as const) {
    assert.equal(recruitmentSmsEvents.includes(eventCode), true, eventCode);
  }
});

test('every recruitment SMS event offers its variable values to the admin page', () => {
  for (const eventCode of recruitmentSmsEvents) {
    assert.equal(getSmsTemplateVariableOptions(eventCode).length > 0, true, eventCode);
  }
});
