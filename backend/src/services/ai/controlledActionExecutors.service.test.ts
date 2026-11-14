import assert from 'node:assert/strict';
import test from 'node:test';
import { listControlledActionDefinitions } from './aiControlledAutomation.service';
import './controlledActionExecutors.service';

test('registers only domain-backed Phase 2 action adapters', () => {
  const configured = listControlledActionDefinitions()
    .filter((definition) => definition.executorConfigured)
    .map((definition) => definition.type)
    .sort();

  assert.deepEqual(configured, [
    'ACCOUNT_STATUS_CHANGE',
    'LEAD_ASSIGNMENT',
    'LISTING_STATUS_CHANGE',
    'PARTNER_KYC_DECISION',
    'PAYMENT_REFUND',
    'PAYMENT_REVIEW',
    'WHATSAPP_SEND',
  ]);
});
