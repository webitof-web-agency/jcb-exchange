import assert from 'node:assert/strict';
import test from 'node:test';
import { getRtoDetailActionState } from './rtoDetailView.mjs';

test('locked RTO detail records expose view-only actions even to users with update permission', () => {
  assert.deepEqual(getRtoDetailActionState({ canUpdate: true, isLocked: true }), {
    canEdit: false,
    canChangeStatus: false,
    mode: 'VIEW_ONLY',
  });
});

test('unlocked RTO detail records expose edit and status actions when permitted', () => {
  assert.deepEqual(getRtoDetailActionState({ canUpdate: true, isLocked: false }), {
    canEdit: true,
    canChangeStatus: true,
    mode: 'EDITABLE',
  });
});
