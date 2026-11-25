import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildPersonalPatch,
  buildSalaryProposal,
  checkDocumentFile,
  describeWeeklyOffs,
  extensionForMime,
  formatSubmittedValue,
  hasStoredFile,
  salaryRowsFrom,
  summariseRevision,
  toPersonalForm,
  validatePersonalForm,
  validateSalaryProposal,
  validateWeeklyOffs,
  mergePersonalForm,
} from './hrmProfile';

const blank = toPersonalForm({});

test('weekly offs read like a sentence and follow the server rules', () => {
  assert.equal(describeWeeklyOffs({ days: ['SUN'], saturdays: [2, 4] }), 'Sundays, 2nd & 4th Saturdays');
  assert.equal(describeWeeklyOffs({ days: ['SAT', 'SUN'] }), 'Saturdays, Sundays');
  assert.equal(describeWeeklyOffs({ days: [], saturdays: [1] }), '1st Saturday');
  assert.equal(describeWeeklyOffs({ days: [] }), 'No weekly off');
  assert.match(validateWeeklyOffs({ days: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] }) ?? '', /working day/);
  assert.match(validateWeeklyOffs({ days: ['SAT'], saturdays: [2] }) ?? '', /already off/);
  assert.equal(validateWeeklyOffs({ days: ['SUN'], saturdays: [2, 4] }), null);
});

test('personal details: addresses are all-or-nothing, PIN is 6 digits, contact needs name + relation + mobile', () => {
  assert.deepEqual(validatePersonalForm(blank, '2026-11-27'), {});
  const partial = { ...blank, currentAddress: { ...blank.currentAddress, city: 'Pune' }, emergencyName: 'Asha' };
  const errors = validatePersonalForm(partial, '2026-11-27');
  assert.ok(errors['currentAddress.line1'] && errors['currentAddress.state'] && errors['currentAddress.pincode']);
  assert.ok(errors.emergencyRelation && errors.emergencyMobile);
  assert.match(validatePersonalForm({ ...blank, dateOfBirth: '2099-01-01' }, '2026-11-27').dateOfBirth ?? '', /future/);
  const good = { ...blank, currentAddress: { line1: '12 MG Road', line2: '', city: 'Pune', state: 'Maharashtra', pincode: '411001' }, emergencyName: 'Asha', emergencyRelation: 'Mother', emergencyMobile: '+91 98765 43210' };
  assert.deepEqual(validatePersonalForm(good, '2026-11-27'), {});
});

test('the personal patch sends only what changed; "same as current" copies the address; empty clears', () => {
  const stored = toPersonalForm({ gender: 'MALE', currentAddress: { line1: 'A', city: 'Pune', state: 'MH', pincode: '411001' } });
  assert.deepEqual(buildPersonalPatch(stored, stored), {});
  const patch = buildPersonalPatch({ ...stored, gender: '', permanentSameAsCurrent: true, emergencyName: 'Asha', emergencyRelation: 'Mother', emergencyMobile: '98765 43210' }, stored);
  assert.equal(patch.gender, null);
  assert.deepEqual(patch.permanentAddress, { line1: 'A', line2: null, city: 'Pune', state: 'MH', pincode: '411001' });
  assert.deepEqual(patch.emergencyContact, { name: 'Asha', relation: 'Mother', mobile: '9876543210' });
  assert.equal('currentAddress' in patch, false);
});

test('salary: proposal checks, rows from the salary in force, totals of a stored revision', () => {
  const rows = salaryRowsFrom({ components: [{ id: '1', code: 'BASIC', name: 'Basic salary', componentType: 'EARNING', amount: '20000' }, { id: '2', code: 'MEAL', name: 'Meal card', componentType: 'EARNING', amount: 1500 }] });
  assert.equal(rows.find((row) => row.code === 'BASIC')?.monthlyAmount, '20000');
  assert.ok(rows.some((row) => row.code === 'MEAL'));
  assert.equal(validateSalaryProposal(rows, '2026-12-01'), null);
  assert.match(validateSalaryProposal(rows.map((row) => ({ ...row, monthlyAmount: '' })), '2026-12-01') ?? '', /at least one/);
  assert.match(validateSalaryProposal([{ code: 'PF_EMPLOYER', name: 'PF', componentType: 'EMPLOYER_CONTRIBUTION', monthlyAmount: '1800' }], '2026-12-01') ?? '', /earning/);
  assert.match(validateSalaryProposal(rows, '') ?? '', /date/);
  assert.deepEqual(buildSalaryProposal(rows).map((row) => row.code), ['BASIC', 'MEAL']);
  assert.deepEqual(summariseRevision({ components: [{ id: '1', code: 'BASIC', name: 'Basic', componentType: 'EARNING', amount: '20000' }, { id: '2', code: 'PF_EMPLOYER', name: 'PF', componentType: 'EMPLOYER_CONTRIBUTION', amount: '1800' }], annualCtc: '261600', grossSalary: '20000' }), { grossMonthly: 20000, ctcMonthly: 21800, annualCtc: 261600 });
  assert.equal(summariseRevision({ components: [], annualCtc: '360000', grossSalary: '0' }).ctcMonthly, 30000);
});

test('document files: type, size, photo must be an image; stored files; extensions', () => {
  assert.equal(checkDocumentFile({ name: 'a.pdf', size: 1000, type: 'application/pdf' }, 'EDUCATION'), null);
  assert.match(checkDocumentFile({ name: 'a.pdf', size: 1000, type: 'application/pdf' }, 'PHOTO') ?? '', /image/);
  assert.match(checkDocumentFile({ name: 'a.docx', size: 1000, type: 'application/msword' }, 'OTHER') ?? '', /PDF/);
  assert.match(checkDocumentFile({ name: 'a.png', size: 6 * 1024 * 1024, type: 'image/png' }, 'OTHER') ?? '', /5 MB/);
  assert.equal(hasStoredFile({ provider: 'GOOGLE_DRIVE' }), true);
  assert.equal(hasStoredFile({ provider: 'MANUAL' }), false);
  assert.equal(extensionForMime('image/webp'), 'webp');
  assert.equal(extensionForMime(undefined), 'bin');
});

test('submitted application values are formatted', () => {
  assert.equal(formatSubmittedValue(7.5, 'lakhs'), '₹7.5 lakh / year');
  assert.equal(formatSubmittedValue(1, 'years'), '1 year');
  assert.equal(formatSubmittedValue('', undefined), null);
});

test('after a version conflict only the fields changed in the dialog keep their typed value', () => {
  const empty = { line1: '', line2: '', city: '', state: '', pincode: '' };
  const baseline = { dateOfBirth: '1990-01-01', gender: 'MALE' as const, fatherOrSpouseName: '', maritalStatus: '' as const, bloodGroup: '' as const, currentAddress: empty, permanentAddress: empty, permanentSameAsCurrent: true, emergencyName: '', emergencyRelation: '', emergencyMobile: '' };
  const typed = { ...baseline, fatherOrSpouseName: 'Ramesh' };
  const fresh = { ...baseline, bloodGroup: 'O+' as const };
  const { merged, kept } = mergePersonalForm(typed, baseline, fresh);
  assert.equal(merged.bloodGroup, 'O+', 'the change somebody else saved is not reverted');
  assert.equal(merged.fatherOrSpouseName, 'Ramesh', 'the typed change is kept');
  assert.deepEqual(kept, ['father / spouse name']);
  assert.deepEqual(mergePersonalForm(baseline, baseline, fresh), { merged: fresh, kept: [] });
});

test('the profile status field only switches between the working states', async () => {
  const { profileStatusControl, describeStatusChangeRefusal } = await import('./hrmProfile');
  assert.deepEqual(profileStatusControl('ACTIVE').options, ['ACTIVE', 'ON_LEAVE', 'NOTICE_PERIOD']);
  assert.equal(profileStatusControl('ON_LEAVE').editable, true);
  assert.equal(profileStatusControl('PRE_ONBOARDING').editable, false);
  assert.match(profileStatusControl('ONBOARDING').hint, /Confirm joining/);
  assert.match(profileStatusControl('EXITED').hint, /Deactivate/);
  assert.deepEqual(profileStatusControl('SUSPENDED').options, ['SUSPENDED']);
  assert.match(describeStatusChangeRefusal({ response: { data: { code: 'USE_CONFIRM_JOINING' } } }) ?? '', /Confirm joining/);
  assert.match(describeStatusChangeRefusal({ response: { data: { code: 'USE_LIFECYCLE' } } }) ?? '', /Deactivate/);
  assert.equal(describeStatusChangeRefusal(new Error('x')), null);
});
