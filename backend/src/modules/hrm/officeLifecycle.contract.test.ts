import assert from 'node:assert/strict';
import test from 'node:test';
import { MAX_BACKDATE_DAYS, MAX_SCHEDULE_DAYS, addDays, parseDay, pickScopeAssignments, planAssignmentChange, toDay } from './assignmentTimeline';
import { HrmHttpError } from './errors';
import { hasAllIndiaScope } from './security';
import { parseHrmInput, schemas } from './validation';

const today = parseDay('2026-11-24');
const code = (fn: () => unknown) => {
  try { fn(); return 'ok'; } catch (error) { return error instanceof HrmHttpError ? error.code : String(error); }
};
const invalidPaths = (fn: () => unknown): string[] => {
  try { fn(); return []; } catch (error) { return ((error as { details?: Array<{ path: string }> }).details ?? []).map((detail) => detail.path); }
};

test('a change after the assignment began ends it the day before', () => {
  const plan = planAssignmentChange({ pivotFrom: parseDay('2026-01-01'), newFrom: parseDay('2026-12-01'), today });
  assert.equal(plan.kind, 'END');
  assert.equal(plan.kind === 'END' && toDay(plan.effectiveTo), '2026-11-30');
});

test('a change on the day the assignment began replaces it instead of ending it before it started', () => {
  assert.deepEqual(planAssignmentChange({ pivotFrom: today, newFrom: today, today }), { kind: 'CANCEL' });
});

test('a change before the current assignment began is refused', () => {
  assert.equal(code(() => planAssignmentChange({ pivotFrom: parseDay('2026-11-20'), newFrom: parseDay('2026-11-19'), today })), 'BEFORE_CURRENT_ASSIGNMENT');
});

test('back-dating and scheduling are limited', () => {
  const longAgo = parseDay('2025-01-01');
  assert.equal(code(() => planAssignmentChange({ pivotFrom: longAgo, newFrom: addDays(today, -MAX_BACKDATE_DAYS), today })), 'ok');
  assert.equal(code(() => planAssignmentChange({ pivotFrom: longAgo, newFrom: addDays(today, -MAX_BACKDATE_DAYS - 1), today })), 'DATE_TOO_OLD');
  assert.equal(code(() => planAssignmentChange({ pivotFrom: longAgo, newFrom: addDays(today, MAX_SCHEDULE_DAYS), today })), 'ok');
  assert.equal(code(() => planAssignmentChange({ pivotFrom: longAgo, newFrom: addDays(today, MAX_SCHEDULE_DAYS + 1), today })), 'DATE_TOO_FAR');
});

test('transfer: a real date and a destination office are required', () => {
  const ok = parseHrmInput(schemas.transferEmployee, { toOfficeUnitId: 'office-1', cityId: 5, effectiveFrom: '2026-12-01', reason: ' relocation ' });
  assert.equal(ok.reason, 'relocation');
  assert.ok(invalidPaths(() => parseHrmInput(schemas.transferEmployee, { toOfficeUnitId: 'office-1', effectiveFrom: '2026-02-31' })).includes('effectiveFrom'));
  assert.ok(invalidPaths(() => parseHrmInput(schemas.transferEmployee, { effectiveFrom: '2026-12-01' })).includes('toOfficeUnitId'));
  assert.ok(invalidPaths(() => parseHrmInput(schemas.transferEmployee, { toOfficeUnitId: 'o', effectiveFrom: '2026-12-01', employeeId: 'x' })).length > 0);
});

test('replace: the outgoing manager action decides which fields are needed', () => {
  const base = { outgoingEmployeeId: 'a', incomingEmployeeId: 'b', effectiveFrom: '2026-12-01' };
  assert.equal(parseHrmInput(schemas.replaceOfficeManager, { ...base, outgoing: { action: 'KEEP_AS_MEMBER' } }).outgoing.action, 'KEEP_AS_MEMBER');
  assert.ok(invalidPaths(() => parseHrmInput(schemas.replaceOfficeManager, { ...base, outgoing: { action: 'TRANSFER' } })).some((path) => path.startsWith('outgoing')));
  assert.equal(parseHrmInput(schemas.replaceOfficeManager, { ...base, outgoing: { action: 'TRANSFER', toOfficeUnitId: 'o', cityId: 3 } }).outgoing.action, 'TRANSFER');
  assert.equal(parseHrmInput(schemas.replaceOfficeManager, { ...base, outgoing: { action: 'DEACTIVATE', outcome: 'SUSPENDED' } }).outgoing.action, 'DEACTIVATE');
  assert.ok(invalidPaths(() => parseHrmInput(schemas.replaceOfficeManager, { ...base, outgoing: { action: 'DELETE' } })).length > 0);
});

test('deactivate: outcome and a reason are required', () => {
  assert.equal(parseHrmInput(schemas.deactivateEmployee, { outcome: 'EXITED', effectiveDate: '2026-11-24', reason: 'Resigned' }).outcome, 'EXITED');
  assert.ok(invalidPaths(() => parseHrmInput(schemas.deactivateEmployee, { outcome: 'EXITED', effectiveDate: '2026-11-24', reason: 'x' })).includes('reason'));
  assert.ok(invalidPaths(() => parseHrmInput(schemas.deactivateEmployee, { outcome: 'FIRED', effectiveDate: '2026-11-24', reason: 'Resigned' })).includes('outcome'));
});

test('state offices: at least one state, a sane upper bound', () => {
  assert.deepEqual(parseHrmInput(schemas.createStateOffices, { stateIds: [4040, 4041] }).stateIds, [4040, 4041]);
  assert.ok(invalidPaths(() => parseHrmInput(schemas.createStateOffices, { stateIds: [] })).includes('stateIds'));
  assert.ok(invalidPaths(() => parseHrmInput(schemas.createStateOffices, { stateIds: Array.from({ length: 61 }, (_, index) => index + 1) })).includes('stateIds'));
});

test('onboarding: only a state office can have a manager; profile details are checked', () => {
  const base = {
    fullName: 'Asha Singh', email: 'asha@example.com', mobile: '9876543210', password: 'Strong@123', joiningDate: '2026-11-24',
    designation: 'State Manager', orgUnitId: 'dept-1',
  };
  assert.ok(invalidPaths(() => parseHrmInput(schemas.onboardEmployee, { ...base, locationType: 'HEAD_OFFICE', isOfficeManager: true })).includes('isOfficeManager'));
  assert.equal(parseHrmInput(schemas.onboardEmployee, { ...base, locationType: 'STATE_OFFICE', stateId: 1, cityId: 2, isOfficeManager: true }).isOfficeManager, true);
  assert.ok(invalidPaths(() => parseHrmInput(schemas.onboardEmployee, { ...base, locationType: 'HEAD_OFFICE', dateOfBirth: '2020-01-01' })).includes('dateOfBirth'));
  assert.ok(invalidPaths(() => parseHrmInput(schemas.onboardEmployee, { ...base, locationType: 'HEAD_OFFICE', dateOfBirth: '1990-02-31' })).includes('dateOfBirth'));
  assert.ok(invalidPaths(() => parseHrmInput(schemas.onboardEmployee, { ...base, locationType: 'HEAD_OFFICE', personalEmail: 'not-an-email' })).includes('personalEmail'));
  assert.equal(parseHrmInput(schemas.onboardEmployee, { ...base, locationType: 'HEAD_OFFICE', dateOfBirth: '1990-05-17', personalEmail: 'a@b.co', preferredName: 'Ash' }).dateOfBirth, '1990-05-17');
});

test('linking an existing login never accepts a password or a second identity', () => {
  const base = { userId: 'user-1', joiningDate: '2026-11-24', designation: 'Executive', orgUnitId: 'dept-1', locationType: 'HEAD_OFFICE' };
  assert.equal(parseHrmInput(schemas.onboardExistingEmployee, base).userId, 'user-1');
  assert.ok(invalidPaths(() => parseHrmInput(schemas.onboardExistingEmployee, { ...base, password: 'Strong@123' })).length > 0);
  assert.ok(invalidPaths(() => parseHrmInput(schemas.onboardExistingEmployee, { ...base, email: 'x@y.com' })).length > 0);
  assert.ok(invalidPaths(() => parseHrmInput(schemas.onboardExistingEmployee, { ...base, locationType: 'STATE_OFFICE' })).includes('stateId'));
  assert.equal(parseHrmInput(schemas.linkLogin, { userId: 'u' }).userId, 'u');
  assert.ok(invalidPaths(() => parseHrmInput(schemas.linkLogin, {})).includes('userId'));
});

test('the All India scope recognises only ALL_INDIA', () => {
  assert.equal(hasAllIndiaScope([{ scopeType: 'STATE' }]), false);
  assert.equal(hasAllIndiaScope([{ scopeType: 'ALL_INDIA' }]), true);
});

test('designations: a name is required, a change must change something', () => {
  assert.equal(parseHrmInput(schemas.createDesignation, { name: '  Area   Head ' }).name, 'Area   Head');
  assert.ok(invalidPaths(() => parseHrmInput(schemas.createDesignation, { name: 'x' })).includes('name'));
  assert.ok(invalidPaths(() => parseHrmInput(schemas.createDesignation, { name: 'Ok', extra: true })).length > 0);
  assert.equal(parseHrmInput(schemas.updateDesignation, { isActive: false }).isActive, false);
  assert.ok(invalidPaths(() => parseHrmInput(schemas.updateDesignation, {})).length > 0);
});

test('password reset: at least 8 characters and at most 72 bytes', () => {
  assert.equal(parseHrmInput(schemas.resetLoginPassword, { password: 'Strong@123' }).password, 'Strong@123');
  assert.ok(invalidPaths(() => parseHrmInput(schemas.resetLoginPassword, { password: 'short' })).includes('password'));
  assert.ok(invalidPaths(() => parseHrmInput(schemas.resetLoginPassword, { password: 'é'.repeat(37) })).includes('password'));
  assert.ok(invalidPaths(() => parseHrmInput(schemas.resetLoginPassword, { password: 'Strong@123', email: 'a@b.co' })).length > 0);
});

test('head office employees may pick a state and city, but only as a pair', () => {
  const base = {
    fullName: 'Asha Singh', email: 'asha@example.com', mobile: '9876543210', password: 'Strong@123', joiningDate: '2026-11-24',
    designation: 'Executive', orgUnitId: 'dept-1', locationType: 'HEAD_OFFICE',
  };
  assert.equal(parseHrmInput(schemas.onboardEmployee, base).locationType, 'HEAD_OFFICE');
  assert.equal(parseHrmInput(schemas.onboardEmployee, { ...base, stateId: 4040, cityId: 133590 }).cityId, 133590);
  assert.ok(invalidPaths(() => parseHrmInput(schemas.onboardEmployee, { ...base, stateId: 4040 })).includes('cityId'));
  assert.ok(invalidPaths(() => parseHrmInput(schemas.onboardEmployee, { ...base, cityId: 5 })).includes('stateId'));
});

test('a mobile number fits the 15-character column, plus sign included', () => {
  const parse = (mobile: string) => code(() => parseHrmInput(schemas.updateEmployee, { version: 1, mobile }));
  assert.equal(parse('9876543210'), 'ok');
  assert.equal(parse('+919876543210'), 'ok');
  assert.equal(parse('+12345678901234'), 'ok'); // 15 characters
  assert.notEqual(parse('+123456789012345'), 'ok'); // 16 characters: would be a 500 from the database
  assert.notEqual(parse('1234567'), 'ok'); // too short
});

test('access is judged by every row in force today, else by every upcoming row (same rule as the list filter)', () => {
  const day = (value: string) => ({ effectiveFrom: parseDay(value), tag: value });
  const now = parseDay('2026-11-28');
  // In force today: only started rows count (a scheduled transfer does not widen access yet).
  assert.deepEqual(pickScopeAssignments([day('2026-11-01'), day('2026-12-20')], now).map((row) => row.tag), ['2026-11-01']);
  // Not started yet: the first placement and an already scheduled transfer both count.
  assert.deepEqual(pickScopeAssignments([day('2026-12-10'), day('2026-12-20')], now).map((row) => row.tag), ['2026-12-10', '2026-12-20']);
  assert.deepEqual(pickScopeAssignments([], now), []);
});
