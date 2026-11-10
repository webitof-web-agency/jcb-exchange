import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CONTROLLED_ACTION_TYPES,
  controlledActionTransition,
  getControlledActionDefinition,
  normalizeControlledActionPayload,
  type ControlledActionType,
} from './aiControlledAutomation.service';

test('catalogue contains every high-risk action and requires human approval', () => {
  const expected: ControlledActionType[] = [
    'PARTNER_KYC_DECISION',
    'ACCOUNT_STATUS_CHANGE',
    'PAYMENT_REVIEW',
    'PAYMENT_REFUND',
    'WHATSAPP_SEND',
    'LEAD_ASSIGNMENT',
    'LISTING_STATUS_CHANGE',
    'PASSWORD_RESET',
    'FINANCIAL_ACTION',
  ];

  assert.deepEqual(CONTROLLED_ACTION_TYPES, expected);
  for (const actionType of expected) {
    assert.equal(getControlledActionDefinition(actionType).requiresHumanApproval, true);
  }
});

test('state machine permits only pending -> approved/rejected and approved -> executing', () => {
  assert.equal(controlledActionTransition('PENDING', 'APPROVE'), 'APPROVED');
  assert.equal(controlledActionTransition('PENDING', 'REJECT'), 'REJECTED');
  assert.equal(controlledActionTransition('APPROVED', 'EXECUTE'), 'EXECUTING');
  assert.throws(() => controlledActionTransition('PENDING', 'EXECUTE'), /approved proposal/i);
  assert.throws(() => controlledActionTransition('REJECTED', 'APPROVE'), /pending proposal/i);
  assert.throws(() => controlledActionTransition('EXECUTED', 'EXECUTE'), /already/i);
});

test('payload normalization rejects secrets and keeps only bounded redacted JSON', () => {
  assert.throws(
    () => normalizeControlledActionPayload('PASSWORD_RESET', { password: 'secret-value' }),
    /sensitive/i,
  );

  const normalized = normalizeControlledActionPayload('LISTING_STATUS_CHANGE', {
    status: 'PUBLISHED',
    reason: 'Reviewed by employee',
  });
  assert.deepEqual(normalized.value, { reason: 'Reviewed by employee', status: 'PUBLISHED' });
  assert.equal(normalized.text.includes('PUBLISHED'), true);
  assert.equal(normalized.text.length < 10_000, true);
});

test('unknown actions fail closed', () => {
  assert.throws(
    () => getControlledActionDefinition('DELETE_DATABASE' as ControlledActionType),
    /not allowlisted/i,
  );
});
