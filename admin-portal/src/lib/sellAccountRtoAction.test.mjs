import assert from 'node:assert/strict';
import test from 'node:test';
import { getSellAccountRtoActionState, shouldShowSaveAndStartRto } from './sellAccountRtoAction.mjs';

test('shows a disabled RTO action for a draft Sell Account', () => {
  assert.deepEqual(
    getSellAccountRtoActionState({
      hasEditingRecord: true,
      canEditSellAccount: true,
      canManageRto: true,
      isDraft: true,
      hasRtoRecord: false,
      purchaserPaymentStatus: 'FULL',
    }),
    {
      visible: true,
      disabled: true,
      label: 'Save Record to Start RTO',
    },
  );
});

test('enables Start RTO Work only for a saved fully-paid Sell Account', () => {
  assert.deepEqual(
    getSellAccountRtoActionState({
      hasEditingRecord: true,
      canEditSellAccount: true,
      canManageRto: true,
      isDraft: false,
      hasRtoRecord: false,
      purchaserPaymentStatus: 'FULL',
    }),
    {
      visible: true,
      disabled: false,
      label: 'Start RTO Work',
    },
  );
});

test('keeps the action visible but disabled when the employee lacks RTO permission', () => {
  assert.deepEqual(
    getSellAccountRtoActionState({
      hasEditingRecord: true,
      canEditSellAccount: true,
      canManageRto: false,
      isDraft: false,
      hasRtoRecord: false,
      purchaserPaymentStatus: 'FULL',
    }),
    {
      visible: true,
      disabled: true,
      label: 'RTO permission required',
    },
  );
});

test('shows save and start only after explicit request and full payment', () => {
  assert.equal(shouldShowSaveAndStartRto({ requested: false, canManageRto: true, purchaserPaymentStatus: 'FULL' }), false);
  assert.equal(shouldShowSaveAndStartRto({ requested: true, canManageRto: true, purchaserPaymentStatus: 'PARTIAL' }), false);
  assert.equal(shouldShowSaveAndStartRto({ requested: true, canManageRto: true, purchaserPaymentStatus: 'FULL' }), true);
});
