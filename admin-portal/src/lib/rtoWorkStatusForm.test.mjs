import assert from 'node:assert/strict';
import test from 'node:test';
import {
  filterSelectOptions,
  getValidityOptions,
  normalizeValidityForEdit,
  isValidityDateRequired,
  getHsrpStatusOptions,
  normalizeHsrpStatus,
  getRtoStatusOptions,
  normalizeRtoStatus,
  normalizeRemark,
  getInitialTermsAccepted,
} from './rtoWorkStatusForm.mjs';

test('offers Not Required in HSRP options and normalizes HSRP status', () => {
  const options = getHsrpStatusOptions();
  assert.equal(options.some((opt) => opt.value === 'NOT_APPLICABLE' && opt.label === 'Not Required'), true);
  assert.equal(normalizeHsrpStatus('NOT_REQUIRED'), 'NOT_APPLICABLE');
  assert.equal(normalizeHsrpStatus('NOT_APPLICABLE'), 'NOT_APPLICABLE');
  assert.equal(normalizeHsrpStatus('YES'), 'YES');
  assert.equal(normalizeHsrpStatus('NO'), 'NO');
});

test('requires validity date only when status is VALID', () => {
  assert.equal(isValidityDateRequired('VALID'), true);
  assert.equal(isValidityDateRequired('EXPIRED'), false);
  assert.equal(isValidityDateRequired('LIFETIME'), false);
  assert.equal(isValidityDateRequired('NOT_AVAILABLE'), false);
});

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

test('exposes only the five canonical RTO workflow statuses', () => {
  assert.deepEqual(getRtoStatusOptions(), [
    { value: 'RTO_WORK_STARTED', label: 'RTO Work Start' },
    { value: 'RTO_WORK_IN_PROGRESS', label: 'RTO Work Progress' },
    { value: 'RTO_WORK_FAILED', label: 'RTO Work Failed / Errors' },
    { value: 'RTO_WORK_COMPLETED', label: 'RTO Work Completed' },
    { value: 'DEAL_DONE', label: 'Deal Done' },
  ]);
  assert.equal(normalizeRtoStatus('APPROVED'), 'RTO_WORK_STARTED');
  assert.equal(normalizeRtoStatus(' in_progress '), 'RTO_WORK_IN_PROGRESS');
});

test('normalizes invalid API status values to the safe initial status', () => {
  assert.equal(normalizeRtoStatus('PENDING'), 'RTO_WORK_IN_PROGRESS');
  assert.equal(normalizeRtoStatus(''), 'RTO_WORK_IN_PROGRESS');
  assert.equal(normalizeRtoStatus('UNKNOWN'), 'RTO_WORK_IN_PROGRESS');
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
