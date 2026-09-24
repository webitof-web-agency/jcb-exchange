import assert from 'node:assert/strict';
import test from 'node:test';
import {
  filterSelectOptions,
  getValidityOptions,
  normalizeValidityForEdit,
  getRtoStatusOptions,
  normalizeRtoStatus,
  normalizeRemark,
  getInitialTermsAccepted,
} from './rtoWorkStatusForm.mjs';

test('keeps LLT mapped to the persisted LIFETIME status', () => {
  const options = getValidityOptions('LIFETIME');

  assert.deepEqual(options.find((option) => option.value === 'LIFETIME'), {
    value: 'LIFETIME',
    label: 'LLT',
  });
  assert.equal(normalizeValidityForEdit('LIFETIME'), 'LIFETIME');
});

test('offers LLT only for the tax validity selector', () => {
  assert.equal(getValidityOptions('', false).some((option) => option.value === 'LIFETIME'), false);
});

test('preserves legacy validity values while editing existing records', () => {
  assert.equal(normalizeValidityForEdit('NOT_AVAILABLE'), 'NOT_AVAILABLE');
  assert.equal(normalizeValidityForEdit('NOT_APPLICABLE'), 'NOT_APPLICABLE');
  assert.equal(normalizeValidityForEdit('PENDING'), 'PENDING');
  assert.equal(normalizeValidityForEdit('UNKNOWN'), 'VALID');
});

test('filters state and city options case-insensitively', () => {
  const options = [
    { value: 'Chhattisgarh', label: 'Chhattisgarh' },
    { value: 'Andhra Pradesh', label: 'Andhra Pradesh' },
  ];

  assert.deepEqual(filterSelectOptions(options, 'chhat'), [options[0]]);
  assert.deepEqual(filterSelectOptions(options, ''), options);
});

test('exposes all RTO workflow statuses for the add/edit form', () => {
  assert.deepEqual(getRtoStatusOptions(), [
    { value: 'PENDING', label: 'Pending' },
    { value: 'IN_PROGRESS', label: 'In Progress' },
    { value: 'DOCUMENT_REQUIRED', label: 'Document Required' },
    { value: 'SUBMITTED', label: 'Submitted' },
    { value: 'APPROVED', label: 'Approved' },
    { value: 'REJECTED', label: 'Rejected' },
    { value: 'COMPLETED', label: 'Completed' },
    { value: 'CANCELLED', label: 'Cancelled' },
  ]);
  assert.equal(normalizeRtoStatus('APPROVED'), 'APPROVED');
});

test('normalizes invalid API status values to the safe initial status', () => {
  assert.equal(normalizeRtoStatus(''), 'PENDING');
  assert.equal(normalizeRtoStatus('UNKNOWN'), 'PENDING');
});

test('normalizes remarks without destroying meaningful multiline content', () => {
  assert.equal(normalizeRemark('  Follow up with RTO\nDocuments submitted.  '), 'Follow up with RTO\nDocuments submitted.');
  assert.equal(normalizeRemark('   '), '');
  assert.equal(normalizeRemark(null), '');
});

test('requires consent for create but keeps saved-record edits actionable', () => {
  assert.equal(getInitialTermsAccepted('create'), false);
  assert.equal(getInitialTermsAccepted('edit'), true);
});
