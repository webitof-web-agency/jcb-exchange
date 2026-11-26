import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPersonalPatch, currentAssignmentOf, startsLater, toPersonalForm, validatePersonalForm } from './hrmProfile';
import { visibleProfileTabs, type ProfileTabAccess } from './hrmProfileTabs';

const today = '2026-11-26';
const row = (designation: string, effectiveFrom: string, effectiveTo: string | null = null, status = 'ACTIVE') => ({ designation, effectiveFrom, effectiveTo, status });

test('a transfer entered for a later date does not replace today\'s posting', () => {
  const rows = [row('New role', '2026-12-15T00:00:00.000Z'), row('Today', '2026-01-01T00:00:00.000Z', '2026-12-14T00:00:00.000Z')];
  const shown = currentAssignmentOf(rows, today)!;
  assert.equal(shown.designation, 'Today');
  assert.equal(startsLater(shown, today), false);
});

test('a joiner shows the posting that is about to start; ended ones are not shown', () => {
  const joiner = currentAssignmentOf([row('Joining', '2026-12-01')], today)!;
  assert.equal(joiner.designation, 'Joining');
  assert.equal(startsLater(joiner, today), true);
  assert.equal(currentAssignmentOf([row('Left', '2025-01-01', '2026-01-01', 'ENDED')], today), null);
  assert.equal(currentAssignmentOf(undefined, today), null);
});

test('details saved earlier do not block an unrelated edit, but a changed part is checked', () => {
  // Saved before these rules existed.
  const saved = toPersonalForm({ fatherOrSpouseName: 'S/O Ramesh 2', currentAddress: { line1: 'A', city: '700001', state: 'WB', pincode: '011001' } });
  const bloodOnly = { ...saved, bloodGroup: 'O+' as const };
  assert.deepEqual(validatePersonalForm(bloodOnly, today, saved), {});
  assert.deepEqual(Object.keys(buildPersonalPatch(bloodOnly, saved)), ['bloodGroup']);
  const touched = { ...saved, currentAddress: { ...saved.currentAddress, line1: 'B' }, permanentSameAsCurrent: false };
  const errors = validatePersonalForm(touched, today, saved);
  assert.ok(errors['currentAddress.city'] && errors['currentAddress.pincode']);
  assert.equal(errors.fatherOrSpouseName, undefined);
  // Without the saved copy everything is checked.
  assert.ok(validatePersonalForm(saved, today).fatherOrSpouseName);
});

test('somebody hired again keeps the tabs that hold their history', () => {
  const access: ProfileTabAccess = { documentsVisible: true, tabs: { kyc: true, attendance: true, leave: true, compensation: true, performance: true, exit: true }, read: { salary: true, shift: true } };
  const ids = visibleProfileTabs('PRE_ONBOARDING', access, { exit: true }).map((tab) => tab.id);
  assert.ok(ids.includes('exit'));
  assert.ok(!ids.includes('attendance'));
});
