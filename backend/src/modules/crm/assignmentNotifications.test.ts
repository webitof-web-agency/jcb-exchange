import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAssignmentNotification } from './assignmentNotifications';

test('builds a lead assignment notification with the actor and deep-link metadata', () => {
  assert.deepEqual(
    buildAssignmentNotification({
      entity: 'LEAD',
      entityId: 'lead-1',
      subject: 'Gulam Rja',
      detail: 'New Lead',
      actorName: 'Megh',
    }),
    {
      title: 'Lead assigned to you',
      message: 'Megh assigned you the lead "Gulam Rja" - New Lead.',
      type: 'CRM_LEAD_ASSIGNED',
      path: '/crm/leads/lead-1',
    },
  );
});

test('builds a follow-up assignment notification with a safe system actor fallback', () => {
  assert.deepEqual(
    buildAssignmentNotification({
      entity: 'FOLLOW_UP',
      entityId: 'follow-up-1',
      subject: 'Gulam Rja',
      detail: 'Call - 28 Oct, 11:00 AM',
      actorName: null,
    }),
    {
      title: 'Follow-up assigned to you',
      message: 'CRM automation assigned you the follow-up for "Gulam Rja" - Call - 28 Oct, 11:00 AM.',
      type: 'CRM_FOLLOW_UP_ASSIGNED',
      path: '/crm/follow-ups',
    },
  );
});

test('builds a contact owner notification without exposing an unsafe target path', () => {
  assert.deepEqual(
    buildAssignmentNotification({
      entity: 'CONTACT',
      entityId: 'contact-1',
      subject: 'ABC Earthmovers',
      detail: 'Account owner',
      actorName: 'Megh',
    }),
    {
      title: 'Contact assigned to you',
      message: 'Megh assigned you the contact "ABC Earthmovers" - Account owner.',
      type: 'CRM_CONTACT_ASSIGNED',
      path: '/crm/contacts/contact-1',
    },
  );
});
