import assert from 'node:assert/strict';
import test from 'node:test';
import { buildEmailTemplateDeletePlan } from './emailTemplateLifecycle';

test('deleting a selected custom email template falls back without re-enabling a paused rule', () => {
  assert.deepEqual(
    buildEmailTemplateDeletePlan({
      templateId: 'custom-template-1',
      eventCode: 'PARTNER_KYC_STATUS_UPDATED',
      fallbackTemplateId: 'system-template-1',
      currentRule: { enabled: false, templateId: 'custom-template-1' },
    }),
    {
      template: { archived: true, enabled: false },
      rule: {
        eventCode: 'PARTNER_KYC_STATUS_UPDATED',
        templateId: 'system-template-1',
        enabled: false,
      },
    },
  );
});

test('deleting an unselected custom template preserves the active automation template', () => {
  assert.deepEqual(
    buildEmailTemplateDeletePlan({
      templateId: 'custom-template-2',
      eventCode: 'PARTNER_KYC_STATUS_UPDATED',
      fallbackTemplateId: 'system-template-1',
      currentRule: { enabled: true, templateId: 'custom-template-1' },
    }),
    {
      template: { archived: true, enabled: false },
      rule: {
        eventCode: 'PARTNER_KYC_STATUS_UPDATED',
        templateId: 'custom-template-1',
        enabled: true,
      },
    },
  );
});

test('deleting a template without an existing automation rule creates a safe enabled fallback rule', () => {
  assert.deepEqual(
    buildEmailTemplateDeletePlan({
      templateId: 'custom-template-1',
      eventCode: 'MARKETPLACE_NEW_LISTING_PUBLISHED',
      fallbackTemplateId: null,
    }),
    {
      template: { archived: true, enabled: false },
      rule: {
        eventCode: 'MARKETPLACE_NEW_LISTING_PUBLISHED',
        templateId: null,
        enabled: true,
      },
    },
  );
});
