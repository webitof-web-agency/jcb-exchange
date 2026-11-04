import assert from 'node:assert/strict';
import test from 'node:test';
import { getAutomationTemplateComponents } from './automationTemplateComponents';

test('uses recruitment variable mapping for recruitment events without explicit components', () => {
  assert.deepEqual(
    getAutomationTemplateComponents(
      'RECRUITMENT_NEW_APPLICATION_SUPERADMIN',
      { applicationRef: 'APP-1', candidateName: 'Megh', jobId: 'JOB-1', jobTitle: 'Operator' },
    ),
    [{
      type: 'body',
      parameters: [
        { type: 'text', text: 'APP-1' },
        { type: 'text', text: 'Megh' },
        { type: 'text', text: 'JOB-1' },
        { type: 'text', text: 'Operator' },
      ],
    }],
  );
});

test('preserves explicit template components for event-specific documents and overrides', () => {
  const explicit = [{ type: 'body', parameters: [{ type: 'text', text: 'already-rendered' }] }];
  assert.equal(getAutomationTemplateComponents('RECRUITMENT_OFFER_SENT', {}, explicit), explicit);
});

test('uses the Meta template definition to build marketplace variables', () => {
  assert.deepEqual(
    getAutomationTemplateComponents(
      'LISTING_PAYMENT_APPROVED',
      { paymentId: 'PAY-1', listingId: 'LIST-1', listingTitle: 'JCB 3DX', method: 'UPI', status: 'Approved', paymentStatus: 'Approved', recipientRole: 'Customer' },
      undefined,
      [{ type: 'BODY', text: '{{1}} {{2}} {{3}}' }],
    ),
    [{
      type: 'body',
      parameters: [
        { type: 'text', text: 'PAY-1' },
        { type: 'text', text: 'LIST-1' },
        { type: 'text', text: 'JCB 3DX' },
      ],
    }],
  );
});
