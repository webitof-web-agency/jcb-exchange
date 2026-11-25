import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canCreateAnotherOffer,
  canOpenHrmProfile,
  closedHandoffReason,
  describeHandoffOutcome,
  describeOfferHrm,
  hrmProfileHref,
  isClosedHrmHandoff,
  isLiveOffer,
  storedHrmFromOfferRow,
} from './offerHrm';

test('HRM state of an accepted offer', () => {
  const done = describeOfferHrm({ status: 'DONE', note: 'Add the salary from the profile.', attempts: 1, employeeId: 'e1', employeeCode: 'EMP-0007' });
  assert.equal(done.label, 'In HRM · EMP-0007');
  assert.equal(done.tone, 'success');
  assert.equal(done.canRun, false);
  assert.equal(done.detail, 'To complete in HRM: Add the salary from the profile.');

  assert.equal(describeOfferHrm({ status: 'PENDING', note: null, attempts: 0, employeeId: null, employeeCode: null }).label, 'Adding to HRM…');

  const failed = describeOfferHrm({ status: 'FAILED', note: 'Drive timeout', attempts: 2, employeeId: null, employeeCode: null });
  assert.equal(failed.tone, 'danger');
  assert.equal(failed.canRun, true);
  assert.equal(failed.runLabel, 'Retry');
  assert.equal(failed.detail, 'Drive timeout (2 attempts)');

  const review = describeOfferHrm({ status: 'NEEDS_REVIEW', note: 'Same mobile as EMP-0003.', attempts: 0, employeeId: null, employeeCode: null });
  assert.equal(review.tone, 'warning');
  assert.equal(review.runLabel, 'Retry after checking');
  assert.equal(review.detail, 'Same mobile as EMP-0003.');

  const legacy = describeOfferHrm(null);
  assert.equal(legacy.label, 'Not in HRM yet');
  assert.equal(legacy.runLabel, 'Add to HRM');
});

test('cancelled joining and dismissed review are final HRM states with the reason', () => {
  const cancelled = describeOfferHrm({ status: 'CANCELLED', note: 'Joining cancelled: Did not turn up.', attempts: 1, employeeId: 'e1', employeeCode: 'EMP-0007' });
  assert.equal(cancelled.label, 'Joining cancelled');
  assert.equal(cancelled.canRun, false);
  assert.equal(cancelled.runLabel, '');
  assert.equal(cancelled.detail, 'Reason: Did not turn up. The HR record was archived (or a re-hire went back to the earlier record). A new offer can be made on this application.');

  const dismissed = describeOfferHrm({ status: 'DISMISSED', note: 'Same person as EMP-0003', attempts: 0, employeeId: null, employeeCode: null });
  assert.equal(dismissed.label, 'HRM review dismissed — no HR record');
  assert.equal(dismissed.canRun, false);
  assert.equal(dismissed.detail, 'Reason: Same person as EMP-0003. No HR record was created from this offer. A new offer can be made on this application.');

  // Cancel joining on a case that never had an HR record is stored as DISMISSED with the cancel prefix.
  const cancelledNoRecord = describeOfferHrm({ status: 'DISMISSED', note: 'Joining cancelled: Took another job', attempts: 0, employeeId: null, employeeCode: null });
  assert.equal(cancelledNoRecord.label, 'Joining cancelled — no HR record');
  assert.equal(cancelledNoRecord.canRun, false);

  assert.equal(describeOfferHrm({ status: 'DISMISSED', note: null, attempts: 0, employeeId: null, employeeCode: null }).detail, 'No HR record was created from this offer. A new offer can be made on this application.');
  assert.equal(closedHandoffReason('Joining cancelled: Moved city'), 'Moved city');
  assert.equal(closedHandoffReason(null), '');
  assert.equal(isClosedHrmHandoff('CANCELLED'), true);
  assert.equal(isClosedHrmHandoff('DISMISSED'), true);
  assert.equal(isClosedHrmHandoff('DONE'), false);
  assert.equal(isClosedHrmHandoff(null), false);
});

test('live offer rule matches the server (DRAFT, SENT, or ACCEPTED with an open handoff)', () => {
  assert.equal(isLiveOffer({ status: 'DRAFT' }), true);
  assert.equal(isLiveOffer({ status: 'SENT', hrmHandoffStatus: null }), true);
  assert.equal(isLiveOffer({ status: 'ACCEPTED', hrmHandoffStatus: null }), true);
  assert.equal(isLiveOffer({ status: 'ACCEPTED', hrmHandoffStatus: 'DONE' }), true);
  assert.equal(isLiveOffer({ status: 'ACCEPTED', hrmHandoffStatus: 'FAILED' }), true);
  assert.equal(isLiveOffer({ status: 'ACCEPTED', hrmHandoffStatus: 'NEEDS_REVIEW' }), true);
  assert.equal(isLiveOffer({ status: 'ACCEPTED', hrmHandoffStatus: 'CANCELLED' }), false);
  assert.equal(isLiveOffer({ status: 'ACCEPTED', hrmHandoffStatus: 'DISMISSED' }), false);
  for (const status of ['DECLINED', 'EXPIRED', 'WITHDRAWN']) assert.equal(isLiveOffer({ status }), false);

  assert.equal(canCreateAnotherOffer([]), true);
  assert.equal(canCreateAnotherOffer([{ status: 'WITHDRAWN' }, { status: 'DECLINED' }]), true);
  assert.equal(canCreateAnotherOffer([{ status: 'ACCEPTED', hrmHandoffStatus: 'CANCELLED' }]), true);
  assert.equal(canCreateAnotherOffer([{ status: 'ACCEPTED', hrmHandoffStatus: 'DISMISSED' }, { status: 'EXPIRED' }]), true);
  assert.equal(canCreateAnotherOffer([{ status: 'ACCEPTED', hrmHandoffStatus: 'CANCELLED' }, { status: 'SENT' }]), false);
  assert.equal(canCreateAnotherOffer([{ status: 'ACCEPTED', hrmHandoffStatus: 'DONE' }]), false);
});

test('HRM profile link needs hrm.employees.read (only Super Admin is all-access)', () => {
  assert.equal(canOpenHrmProfile({ role: 'SUPER_ADMIN', permissions: [] }), true);
  assert.equal(canOpenHrmProfile({ role: 'EMPLOYEE', permissions: ['hrm.employees.read'] }), true);
  assert.equal(canOpenHrmProfile({ role: 'EMPLOYEE', permissions: ['ALL_ACCESS'] }), true);
  assert.equal(canOpenHrmProfile({ role: 'EMPLOYEE', permissions: ['recruitment.offers.read', 'hrm.org.read'] }), false);
  assert.equal(canOpenHrmProfile({ role: 'ADMIN', permissions: ['recruitment.offers.read'] }), false);
  assert.equal(canOpenHrmProfile({ role: 'ADMIN', permissions: ['hrm.employees.read'] }), true);
  assert.equal(canOpenHrmProfile(null), false);
});

test('profile link stays in the same portal', () => {
  assert.equal(hrmProfileHref('/employee/recruitment/offers', 'abc'), '/employee/hrm/abc');
  assert.equal(hrmProfileHref('/admin/recruitment/offers', 'abc'), '/admin/hrm/abc');
});

test('handoff outcome toasts and raw offer rows', () => {
  assert.deepEqual(describeHandoffOutcome({ outcome: 'CREATED', caseId: 'c', employeeId: 'e', notes: [] }, 'EMP-0009'), { kind: 'success', message: 'Added to HRM as EMP-0009.' });
  assert.equal(describeHandoffOutcome({ outcome: 'REHIRED', caseId: 'c', employeeId: 'e', notes: ['Re-hire.'] }).message, 'Re-hired in HRM. Re-hire.');
  assert.equal(describeHandoffOutcome({ outcome: 'ALREADY_DONE', caseId: 'c', employeeId: 'e', notes: [] }).kind, 'info');
  assert.deepEqual(describeHandoffOutcome({ outcome: 'NEEDS_REVIEW', caseId: 'c', notes: ['Check EMP-0003.'] }), { kind: 'warning', message: 'Check EMP-0003.' });
  assert.deepEqual(storedHrmFromOfferRow({ hrmHandoffStatus: 'DONE', hrmEmployeeId: 'e1' }), { status: 'DONE', note: null, attempts: 0, employeeId: 'e1', employeeCode: null });
});
