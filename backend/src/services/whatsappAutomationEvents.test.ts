import assert from 'node:assert/strict';
import test from 'node:test';
import { recruitmentWhatsAppEvents } from './whatsappIntegration.service';

test('registers only candidate-safe recruitment automation events', () => {
  assert.deepEqual(recruitmentWhatsAppEvents, [
    'RECRUITMENT_APPLICATION_RECEIVED',
    'RECRUITMENT_NEW_APPLICATION_SUPERADMIN',
    'RECRUITMENT_NEW_APPLICATION_RECRUITER',
    'RECRUITMENT_APPLICATION_STAGE_UPDATED',
    'RECRUITMENT_INTERVIEW_SCHEDULED',
    'RECRUITMENT_INTERVIEW_RESCHEDULED',
    'RECRUITMENT_INTERVIEW_CANCELLED',
    'RECRUITMENT_OFFER_SENT',
    'RECRUITMENT_OFFER_STATUS_UPDATED',
    'RECRUITMENT_NEW_JOB_PUBLISHED',
  ]);
});
