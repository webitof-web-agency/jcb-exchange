import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeFollowUpEdit, FOLLOW_UP_EDIT_TYPES } from './followupEdit';

test('normalizeFollowUpEdit trims editable follow-up fields and keeps a valid type', () => {
  assert.deepEqual(normalizeFollowUpEdit({ type: ' call ', title: '  Call buyer  ', notes: '  Confirm budget  ', ownerId: ' staff-1 ' }), {
    type: 'CALL',
    title: 'Call buyer',
    notes: 'Confirm budget',
    ownerId: 'staff-1',
  });
});

test('normalizeFollowUpEdit clears optional text and owner fields safely', () => {
  assert.deepEqual(normalizeFollowUpEdit({ type: FOLLOW_UP_EDIT_TYPES[0], title: ' ', notes: '', ownerId: '' }), {
    type: 'CALL',
    title: null,
    notes: null,
    ownerId: null,
  });
});
