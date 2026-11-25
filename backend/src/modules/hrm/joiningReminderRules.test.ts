import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_RUN_ATTEMPTS_PER_DAY,
  buildReminderNotification,
  buildReminderPayload,
  channelDispatchFailed,
  describeMissingItemsShort,
  createReminderRunner,
  describeMissingItems,
  friendlyDay,
  initialReminderRunState,
  isJoiningReminderDue,
  managesOnboarding,
  mergeReminderRecipients,
  onboardingPathFor,
  pickPlacementOn,
  planReminderRun,
  portalUrl,
  recordReminderRun,
  reminderDays,
  reminderNotificationKey,
  reminderRecipientType,
  reminderRelatedEntityId,
  stateOfficeTarget,
  type StaffContact,
} from './joiningReminderRules';
import { buildChecklist, checklistProgress, type ChecklistFacts } from './onboardingChecklist';

const day = (value: string) => new Date(`${value}T00:00:00.000Z`);
// 2026-11-25 09:30 IST = 04:00 UTC.
const morning = new Date('2026-11-25T04:00:00.000Z');

test('IST dates: the joining day is tomorrow in India, also late in the UTC evening', () => {
  assert.deepEqual(reminderDays(morning), { today: day('2026-11-25'), todayKey: '2026-11-25', joiningDay: day('2026-11-26'), joiningDayKey: '2026-11-26' });
  // 2026-11-25 20:00 UTC is already 26 Nov 01:30 in India.
  assert.equal(reminderDays(new Date('2026-11-25T20:00:00.000Z')).joiningDayKey, '2026-11-27');
  // Month and year ends.
  assert.equal(reminderDays(new Date('2026-12-31T05:00:00.000Z')).joiningDayKey, '2027-01-01');
});

test('runs once per Indian day after 09:00 and tries a failed run again', () => {
  // 08:59 IST: not yet.
  assert.deepEqual(planReminderRun(new Date('2026-11-25T03:29:00.000Z'), initialReminderRunState), { run: false, reason: 'BEFORE_START' });
  // 09:00 IST: the first run of the day (also the start-up catch-up after a restart: fresh state).
  const first = planReminderRun(new Date('2026-11-25T03:30:00.000Z'), initialReminderRunState);
  assert.deepEqual(first, { run: true, day: '2026-11-25', attempt: 1 });

  const done = recordReminderRun(initialReminderRunState, '2026-11-25', true);
  assert.deepEqual(planReminderRun(new Date('2026-11-25T10:00:00.000Z'), done), { run: false, reason: 'DONE_TODAY' });
  // The next Indian day runs again.
  assert.deepEqual(planReminderRun(new Date('2026-11-26T04:00:00.000Z'), done), { run: true, day: '2026-11-26', attempt: 1 });

  let failing = recordReminderRun(initialReminderRunState, '2026-11-25', false);
  assert.deepEqual(planReminderRun(morning, failing), { run: true, day: '2026-11-25', attempt: 2 });
  for (let attempt = 2; attempt <= MAX_RUN_ATTEMPTS_PER_DAY; attempt += 1) failing = recordReminderRun(failing, '2026-11-25', false);
  assert.equal(failing.attempts, MAX_RUN_ATTEMPTS_PER_DAY);
  assert.deepEqual(planReminderRun(morning, failing), { run: false, reason: 'GAVE_UP_TODAY' });
  // A new day starts counting again.
  assert.deepEqual(recordReminderRun(failing, '2026-11-26', false), { day: '2026-11-26', done: false, attempts: 1 });
});

test('the runner acts once a day, never overlaps, and counts a thrown error as a failed run', async () => {
  let calls = 0;
  let release: () => void = () => {};
  const runner = createReminderRunner(async () => {
    calls += 1;
    await new Promise<void>((resolve) => { release = resolve; });
    return { failed: 0 };
  });
  const firstRun = runner.wake(morning);
  assert.deepEqual(await runner.wake(morning), { skipped: 'RUNNING' });
  release();
  assert.equal((await firstRun as { ran?: boolean }).ran, true);
  assert.deepEqual(await runner.wake(new Date('2026-11-25T08:00:00.000Z')), { skipped: 'DONE_TODAY' });
  assert.equal(calls, 1);

  let tries = 0;
  const flaky = createReminderRunner(async () => {
    tries += 1;
    if (tries === 1) throw new Error('database unavailable');
    return { failed: 0 };
  });
  await assert.rejects(flaky.wake(morning), /database unavailable/);
  assert.deepEqual(flaky.state(), { day: '2026-11-25', done: false, attempts: 1 });
  assert.equal((await flaky.wake(morning) as { attempt?: number }).attempt, 2);
  assert.equal(flaky.state().done, true);
});

const incomplete: ChecklistFacts = {
  personal: { dateOfBirth: true, gender: true, currentAddress: true, emergencyContact: true },
  hasPlacement: true, panVerified: false, aadhaarVerified: true, bank: 'ADDED',
  documents: { OFFER: 'VERIFIED', ACCEPTANCE: 'VERIFIED', PHOTO: 'MISSING', ADDRESS: 'MISSING', EDUCATION: 'MISSING' },
  salary: 'APPROVED', hasShift: false, hasLogin: false,
};

test('who is due: joins tomorrow, not joined, not archived, open case, checklist incomplete', () => {
  const tomorrow = day('2026-11-26');
  const base = { status: 'PRE_ONBOARDING', archivedAt: null, joinedOn: tomorrow, hasOpenCase: true };
  const missing = checklistProgress(buildChecklist(incomplete)).missingRequired;
  assert.deepEqual(missing, ['PAN', 'BANK', 'PHOTO', 'SHIFT']);
  assert.equal(isJoiningReminderDue(base, tomorrow, missing), true);
  assert.equal(isJoiningReminderDue({ ...base, status: 'DRAFT' }, tomorrow, missing), true);
  assert.equal(isJoiningReminderDue({ ...base, status: 'ACTIVE' }, tomorrow, missing), false, 'already joined');
  assert.equal(isJoiningReminderDue({ ...base, archivedAt: new Date() }, tomorrow, missing), false, 'never-joined record');
  assert.equal(isJoiningReminderDue({ ...base, hasOpenCase: false }, tomorrow, missing), false, 'case completed or cancelled');
  assert.equal(isJoiningReminderDue({ ...base, joinedOn: day('2026-11-27') }, tomorrow, missing), false, 'joins later');
  assert.equal(isJoiningReminderDue({ ...base, joinedOn: null }, tomorrow, missing), false, 'no date yet');
  assert.equal(isJoiningReminderDue(base, tomorrow, []), false, 'checklist complete');
});

test('the missing items read as checklist labels and stay short', () => {
  const items = buildChecklist(incomplete);
  assert.equal(describeMissingItems(items, ['PAN', 'BANK']), 'PAN verified, Salary bank account');
  assert.equal(
    describeMissingItems(items, ['PERSONAL', 'PAN', 'BANK', 'PHOTO', 'SALARY', 'SHIFT']),
    'Personal details, PAN verified, Salary bank account, Passport photo and 2 more',
  );
  assert.equal(describeMissingItems(items, ['UNKNOWN']), 'UNKNOWN');
});

test('placement on the joining day, and whose State Manager is told', () => {
  const rows = [
    { id: 'first', effectiveFrom: day('2026-11-26'), effectiveTo: day('2026-11-30') },
    { id: 'transfer', effectiveFrom: day('2026-12-01'), effectiveTo: null },
    { id: 'old', effectiveFrom: day('2025-01-01'), effectiveTo: day('2025-12-31') },
  ];
  assert.equal(pickPlacementOn(rows, day('2026-11-26'))?.id, 'first');
  assert.equal(pickPlacementOn(rows.slice(1), day('2026-11-26'))?.id, 'transfer', 'only upcoming: the next one');
  assert.equal(pickPlacementOn([], day('2026-11-26')), null);

  assert.deepEqual(stateOfficeTarget({ stateId: 21, officeUnit: { id: 'mh', type: 'REGION', stateId: 21 } }), { officeUnitId: 'mh' });
  assert.equal(stateOfficeTarget({ stateId: 21, officeUnit: { id: 'ho', type: 'HEAD_OFFICE', stateId: 21 } }), null, 'head office has no State Manager');
  assert.deepEqual(stateOfficeTarget({ stateId: 21, officeUnit: null }), { stateId: 21 });
  assert.equal(stateOfficeTarget({ stateId: null, officeUnit: null }), null);
  assert.equal(stateOfficeTarget(null), null);
});

test('hrm.onboarding.manage: custom role first, else direct grants; Super Admin always', () => {
  assert.equal(managesOnboarding({ role: 'SUPER_ADMIN', customRole: null, adminPermissions: [] }), true);
  assert.equal(managesOnboarding({ role: 'EMPLOYEE', customRole: { permissions: ['hrm.onboarding.manage'] }, adminPermissions: [] }), true);
  assert.equal(managesOnboarding({ role: 'EMPLOYEE', customRole: { permissions: ['ALL_ACCESS'] }, adminPermissions: [] }), true);
  // A role overrides the direct grants (the same as every route guard).
  assert.equal(managesOnboarding({ role: 'EMPLOYEE', customRole: { permissions: ['hrm.onboarding.read'] }, adminPermissions: [{ permission: 'hrm.onboarding.manage' }] }), false);
  assert.equal(managesOnboarding({ role: 'ADMIN', customRole: null, adminPermissions: [{ permission: 'hrm.onboarding.manage' }] }), true);
  assert.equal(managesOnboarding({ role: 'EMPLOYEE', customRole: null, adminPermissions: [{ permission: 'hrm.onboarding.read' }] }), false);
  assert.equal(managesOnboarding({ role: 'CUSTOMER', customRole: null, adminPermissions: [{ permission: 'ALL_ACCESS' }] }), false);
});

const staff = (id: string, extra: Partial<StaffContact> = {}): StaffContact => ({
  id, role: 'EMPLOYEE', status: 'ACTIVE', email: `${id}@example.com`, mobile: '9000000000', whatsappNumber: null, ...extra,
});

test('recipients: one reminder each, HR first, inactive and own login left out', () => {
  const recipients = mergeReminderRecipients({
    hr: [staff('hr-1', { whatsappNumber: ' 9111111111 ' }), staff('admin', { role: 'SUPER_ADMIN', email: null }), staff('joiner')],
    stateManagers: [staff('hr-1'), staff('sm-1', { email: ' ' }), staff('sm-off', { status: 'SUSPENDED' }), staff('partner', { role: 'PARTNER' })],
    joinerUserId: 'joiner',
  });
  assert.deepEqual(recipients, [
    { userId: 'hr-1', role: 'EMPLOYEE', email: 'hr-1@example.com', phone: '9111111111', reason: 'HR' },
    { userId: 'admin', role: 'SUPER_ADMIN', email: null, phone: '9000000000', reason: 'HR' },
    { userId: 'sm-1', role: 'EMPLOYEE', email: null, phone: '9000000000', reason: 'STATE_MANAGER' },
  ]);
});

test('recipient type, portal link and dedupe keys', () => {
  assert.equal(reminderRecipientType('SUPER_ADMIN'), 'SUPER_ADMIN');
  assert.equal(reminderRecipientType('ADMIN'), 'RECRUITER');
  assert.equal(reminderRecipientType('EMPLOYEE'), 'RECRUITER');
  assert.equal(onboardingPathFor('SUPER_ADMIN'), '/admin/hrm/onboarding');
  assert.equal(onboardingPathFor('ADMIN'), '/employee/hrm/onboarding');
  assert.equal(portalUrl('/employee/hrm/onboarding', 'https://admin.example.com/'), 'https://admin.example.com/employee/hrm/onboarding');
  assert.equal(portalUrl('/admin/hrm/onboarding', undefined), '/admin/hrm/onboarding');
  assert.equal(portalUrl('/admin/hrm/onboarding', 'admin.example.com'), '/admin/hrm/onboarding', 'not a web address');
  assert.equal(reminderNotificationKey('emp-1', '2026-11-26', 'user-1'), 'hrm-joining-reminder:emp-1:2026-11-26:user-1');
  assert.equal(reminderRelatedEntityId('emp-1', '2026-11-26'), 'emp-1:2026-11-26');
});

test('payload and in-app text', () => {
  const joiner = {
    employeeId: 'emp-1', employeeName: 'Priya Sharma', employeeCode: 'JCB-0042', designation: 'Sales Executive',
    joiningDate: '2026-11-26', officeName: 'Maharashtra State Office', stateName: 'Maharashtra', missingItems: 'PAN verified, Passport photo', missingCount: 2,
  };
  assert.deepEqual(buildReminderPayload(joiner, 'https://admin.example.com/employee/hrm/onboarding'), {
    employeeName: 'Priya Sharma', employeeCode: 'JCB-0042', designation: 'Sales Executive', joiningDate: '2026-11-26',
    officeName: 'Maharashtra State Office', stateName: 'Maharashtra', missingItems: 'PAN verified, Passport photo',
    missingItemsShort: '2 items pending', onboardingUrl: 'https://admin.example.com/employee/hrm/onboarding',
  });
  assert.deepEqual(buildReminderNotification(joiner), {
    title: 'Joining tomorrow: Priya Sharma',
    message: 'Priya Sharma (JCB-0042), Sales Executive, joins on 26 Nov 2026 at Maharashtra State Office. Still open on the joining checklist: PAN verified, Passport photo.',
  });
  assert.equal(
    buildReminderNotification({ ...joiner, designation: '', officeName: '' }).message,
    'Priya Sharma (JCB-0042) joins on 26 Nov 2026. Still open on the joining checklist: PAN verified, Passport photo.',
  );
  assert.equal(friendlyDay('2027-01-05'), '5 Jan 2027');
  assert.equal(friendlyDay('not a day'), 'not a day');
});

test('SMS gets a short missing-items text; a channel that could not queue fails the run (switched-off does not)', () => {
  for (const count of [0, 1, 2, 9, 125]) assert.ok(describeMissingItemsShort(count).length <= 30, String(count));
  assert.equal(describeMissingItemsShort(1), '1 item pending');
  assert.equal(describeMissingItemsShort(3), '3 items pending');
  assert.equal(channelDispatchFailed({ queued: true, sent: true }), false);
  assert.equal(channelDispatchFailed({ queued: false, duplicate: true }), false);
  assert.equal(channelDispatchFailed({ queued: false, reason: 'RULE_DISABLED' }), false);
  assert.equal(channelDispatchFailed({ queued: false, reason: 'RECIPIENT_MISSING' }), false);
  assert.equal(channelDispatchFailed({ queued: false, reason: 'DISPATCH_ERROR' }), true);
  assert.equal(channelDispatchFailed(new Error('pool timeout')), true);
  assert.equal(channelDispatchFailed(null), false);
});
