import assert from 'node:assert/strict';
import test from 'node:test';
import {
  communicationEventRegistry,
  getCommunicationEvent,
  getEmailAttachmentModeForEvent,
  getEmailEventCodeForTemplateCode,
  getEmailTemplateCode,
} from './communicationEventRegistry';
import { sanitizeEmailHtml } from '../utils/htmlSanitizer';

test('email registry mirrors every WhatsApp automation event', () => {
  const whatsappEvents = communicationEventRegistry.filter((event) => event.whatsappSupported);
  assert.equal(new Set(whatsappEvents.map((event) => event.eventCode)).size, whatsappEvents.length);
  assert.ok(whatsappEvents.length >= 20);
  assert.ok(getCommunicationEvent('RECRUITMENT_OFFER_SENT'));
});

test('document policy is fixed by the event and cannot be selected arbitrarily', () => {
  assert.equal(getEmailAttachmentModeForEvent('RECRUITMENT_OFFER_SENT'), 'DYNAMIC_OFFER_PDF');
  assert.equal(getEmailAttachmentModeForEvent('VEHICLE_SALE_INVOICE'), 'DYNAMIC_VEHICLE_INVOICE_PDF');
  assert.equal(getEmailAttachmentModeForEvent('RECRUITMENT_APPLICATION_RECEIVED'), 'NONE');
});

test('legacy recruitment template codes remain compatible', () => {
  assert.equal(getEmailTemplateCode('RECRUITMENT_OFFER_SENT'), 'OFFER_SENT');
  assert.equal(getEmailTemplateCode('RECRUITMENT_APPLICATION_RECEIVED'), 'APPLICATION_RECEIVED');
  assert.equal(getEmailEventCodeForTemplateCode('APPLICATION_RECEIVED'), 'RECRUITMENT_APPLICATION_RECEIVED');
  assert.equal(getEmailEventCodeForTemplateCode('RECRUITMENT_APPLICATION_RECEIVED'), 'RECRUITMENT_APPLICATION_RECEIVED');
});

test('every default email body uses only variables exposed by its event', () => {
  for (const event of communicationEventRegistry) {
    const usedVariables = [...`${event.defaultSubject}\n${event.defaultBodyHtml}`.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)].map((match) => match[1]);
    for (const variable of usedVariables) {
      if (variable) assert.ok(event.variables.includes(variable), `${event.eventCode} must expose ${variable}`);
    }
  }
});

const mergeTags = (text: string) => [...text.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)].map((match) => match[1]!);

test('default subjects hold no link or code value (the subject is stored in the delivery log)', () => {
  // Same rule as the template editor: it refuses url / link / code variables in a subject.
  for (const event of communicationEventRegistry) {
    for (const variable of mergeTags(event.defaultSubject)) {
      assert.doesNotMatch(variable, /url|link|code/i, `${event.eventCode} subject uses {{${variable}}}`);
    }
  }
});

test('default bodies keep their merge tags through the email sanitizer used when HR saves a template', () => {
  for (const event of communicationEventRegistry) {
    assert.deepEqual(mergeTags(sanitizeEmailHtml(event.defaultBodyHtml)), mergeTags(event.defaultBodyHtml), event.eventCode);
  }
});

test('the offer invitation links with the short link and declares both link variables', () => {
  const offer = getCommunicationEvent('RECRUITMENT_OFFER_SENT')!;
  assert.match(offer.defaultBodyHtml, /href="\{\{offer_short_url\}\}"[^>]*>View &amp; sign your offer</);
  for (const variable of ['offer_short_url', 'offer_response_url', 'offer_valid_until']) assert.ok(offer.variables.includes(variable), variable);
  // Earlier defaults are recognised so the seed can move an unedited system template to the new one.
  assert.ok(offer.previousDefaultBodies?.every((body) => body !== offer.defaultBodyHtml && body.includes('{{candidate_name}}')));
});

test('phase 7 recruitment events have their email defaults, document policy and template codes', () => {
  assert.equal(getEmailAttachmentModeForEvent('RECRUITMENT_OFFER_ACCEPTED'), 'DYNAMIC_OFFER_ACCEPTANCE_PDF');
  assert.equal(getEmailTemplateCode('RECRUITMENT_OFFER_ACCEPTED'), 'OFFER_ACCEPTED');
  assert.equal(getEmailEventCodeForTemplateCode('OFFER_ACCEPTED'), 'RECRUITMENT_OFFER_ACCEPTED');
  assert.deepEqual(getCommunicationEvent('RECRUITMENT_OFFER_ACCEPTED')!.variables, ['candidate_name', 'application_ref', 'job_title', 'designation', 'joining_date', 'accepted_on']);
  for (const eventCode of ['RECRUITMENT_OFFER_ACCEPTED_HR', 'RECRUITMENT_JOINING_REMINDER', 'RECRUITMENT_JOINING_WELCOME']) {
    assert.equal(getEmailAttachmentModeForEvent(eventCode), 'NONE', eventCode);
    assert.equal(getEmailTemplateCode(eventCode), eventCode);
  }
  // The reminder may link the portal onboarding page (sign-in required); no other new event carries a link.
  assert.ok(getCommunicationEvent('RECRUITMENT_JOINING_REMINDER')!.defaultBodyHtml.includes('href="{{onboarding_url}}"'));
  assert.ok(getCommunicationEvent('RECRUITMENT_JOINING_WELCOME')!.variables.includes('login_email'));
});

test('variables of the new events are the snake_case names of the payloads their senders build', () => {
  const snake = (keys: string[]) => keys.map((key) => key.replace(/[A-Z]/g, (character) => `_${character.toLowerCase()}`));
  const payloads: Record<string, string[]> = {
    RECRUITMENT_OFFER_ACCEPTED_HR: ['candidateName', 'applicationId', 'applicationRef', 'jobTitle', 'designation', 'joiningDate', 'acceptedOn'],
    RECRUITMENT_JOINING_REMINDER: ['employeeName', 'employeeCode', 'designation', 'joiningDate', 'officeName', 'stateName', 'missingItems', 'onboardingUrl'],
    RECRUITMENT_JOINING_WELCOME: ['employeeName', 'employeeCode', 'designation', 'joiningDate', 'officeName', 'loginEmail'],
  };
  for (const [eventCode, keys] of Object.entries(payloads)) {
    assert.deepEqual(getCommunicationEvent(eventCode)!.variables, snake(keys), eventCode);
  }
});
