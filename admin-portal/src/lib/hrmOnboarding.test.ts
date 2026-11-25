import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildLoginDetailsText,
  createEmptyOnboardForm,
  describeLostSelections,
  describeNationalManager,
  describeStateOffice,
  extractFieldErrors,
  fieldForServerMessage,
  findByName,
  generateTemporaryPassword,
  getStateManagerDefaults,
  isOnboardFormDirty,
  isValidEmail,
  locationAfterSwitch,
  maxDateOfBirth,
  maxJoiningDate,
  normaliseLoginSearch,
  normaliseName,
  normalizeMobile,
  reconcileDepartment,
  reconcileDesignation,
  revertStateManagerDefaults,
  sanitiseMobileInput,
  stateOptionLabel,
  toDateInputValue,
  toOnboardExistingPayload,
  toOnboardPayload,
  validateDateOfBirth,
  validateJoiningDate,
  validateOnboardForm,
  type OnboardForm,
} from './hrmOnboarding';

const valid: OnboardForm = {
  ...createEmptyOnboardForm('2026-11-24'),
  fullName: ' Asha Singh ', mobile: '+91 98765-43210', email: ' asha@example.com ', password: 'Strong@123',
  designation: ' State Manager ', orgUnitId: 'dept-1',
};

test('mobile numbers are reduced to 10 digits', () => {
  assert.equal(normalizeMobile('+91 98765-43210'), '9876543210');
  assert.equal(normalizeMobile('09876543210'), '9876543210');
  assert.equal(normalizeMobile('919876543210'), '9876543210');
  assert.equal(normalizeMobile('98765 43210 99'), '987654321099');
  assert.equal(normalizeMobile('12345'), '12345');
});

test('a head office employee needs only the common fields', () => {
  assert.deepEqual(validateOnboardForm(valid, { headOfficeAvailable: true }), {});
  const empty = validateOnboardForm(createEmptyOnboardForm('2026-11-24'), { headOfficeAvailable: true });
  assert.deepEqual(Object.keys(empty).sort(), ['designation', 'email', 'fullName', 'mobile', 'orgUnitId', 'password']);
});

test('state office needs state and city, and head office must exist in the location master', () => {
  const state = { ...valid, locationType: 'STATE_OFFICE' as const };
  assert.deepEqual(Object.keys(validateOnboardForm(state, { headOfficeAvailable: true })).sort(), ['cityId', 'stateId']);
  assert.deepEqual(validateOnboardForm({ ...state, stateId: '4040', cityId: '133590' }, { headOfficeAvailable: true }), {});
  assert.ok(validateOnboardForm(valid, { headOfficeAvailable: false }).locationType);
});

test('password length and email format are checked', () => {
  assert.ok(validateOnboardForm({ ...valid, password: 'short' }, { headOfficeAvailable: true }).password);
  assert.ok(validateOnboardForm({ ...valid, password: 'x'.repeat(73) }, { headOfficeAvailable: true }).password);
  assert.ok(validateOnboardForm({ ...valid, email: 'asha@' }, { headOfficeAvailable: true }).email);
});

test('payload is trimmed, numeric ids are numbers and head office sends no state or city', () => {
  const head = toOnboardPayload(valid);
  assert.equal(head.fullName, 'Asha Singh');
  assert.equal(head.mobile, '9876543210');
  assert.equal(head.email, 'asha@example.com');
  assert.equal(head.designation, 'State Manager');
  assert.equal(head.customRoleId, null);
  assert.equal(head.stateId, null);
  assert.equal(head.cityId, null);
  const state = toOnboardPayload({ ...valid, locationType: 'STATE_OFFICE', stateId: '4040', cityId: '133590', customRoleId: 'role-1' });
  assert.deepEqual([state.stateId, state.cityId, state.customRoleId], [4040, 133590, 'role-1']);
});

test('the reporting manager is never part of the add payloads (the server applies the default)', () => {
  assert.equal('managerEmployeeId' in toOnboardPayload(valid), false);
  assert.equal('managerEmployeeId' in toOnboardPayload({ ...valid, locationType: 'STATE_OFFICE', stateId: '1', cityId: '2', isOfficeManager: true }), false);
  assert.equal('managerEmployeeId' in toOnboardExistingPayload({ ...valid, userId: 'user-1' }), false);
  assert.equal('managerEmployeeId' in createEmptyOnboardForm('2026-11-24'), false);
});

const RAIPUR = { stateId: 4040, cityId: 133590 };

test('a head office employee starts on the head office place and may pick another one, state and city together', () => {
  const head = createEmptyOnboardForm('2026-11-24', 'HEAD_OFFICE', RAIPUR);
  assert.deepEqual([head.stateId, head.cityId], ['4040', '133590']);
  const filled: OnboardForm = { ...head, fullName: 'Asha', mobile: '9876543210', email: 'a@b.co', password: 'Strong@123', designation: 'Executive', orgUnitId: 'dept-1' };
  assert.deepEqual(validateOnboardForm(filled, { headOfficeAvailable: true }), {});
  assert.deepEqual(validateOnboardForm({ ...filled, stateId: '4041', cityId: '' }, { headOfficeAvailable: true }), { cityId: 'Select both the state and the city.' });
  assert.deepEqual(validateOnboardForm({ ...filled, stateId: '', cityId: '133590' }, { headOfficeAvailable: true }), { stateId: 'Select both the state and the city.' });
  // Neither chosen is fine: the server uses the head office's own place.
  assert.deepEqual(validateOnboardForm({ ...filled, stateId: '', cityId: '' }, { headOfficeAvailable: true }), {});
  const payload = toOnboardPayload(filled);
  assert.deepEqual([payload.locationType, payload.stateId, payload.cityId], ['HEAD_OFFICE', 4040, 133590]);
  const another = toOnboardPayload({ ...filled, stateId: '4041', cityId: '99' });
  assert.deepEqual([another.stateId, another.cityId], [4041, 99]);
  assert.deepEqual([toOnboardPayload({ ...filled, stateId: '', cityId: '' }).stateId, toOnboardExistingPayload({ ...filled, userId: 'u', stateId: '4041', cityId: '99' }).cityId], [null, 99]);
});

test('switching the work location resets the place sensibly', () => {
  assert.deepEqual(locationAfterSwitch({ stateId: '4041', cityId: '7' }, 'HEAD_OFFICE', RAIPUR), { stateId: '4040', cityId: '133590' });
  assert.deepEqual(locationAfterSwitch({ stateId: '4040', cityId: '133590' }, 'STATE_OFFICE', RAIPUR), { stateId: '', cityId: '' });
  assert.deepEqual(locationAfterSwitch({ stateId: '4041', cityId: '7' }, 'STATE_OFFICE', RAIPUR), { stateId: '4041', cityId: '7' });
  assert.deepEqual(locationAfterSwitch({ stateId: '4041', cityId: '7' }, 'HEAD_OFFICE', null), { stateId: '', cityId: '' });
});

test('names are matched ignoring case and spacing, and the selection follows renames and removals', () => {
  const designations = [{ id: 'a', name: 'State Manager' }, { id: 'b', name: 'Area Head' }];
  assert.equal(findByName(designations, '  area   HEAD ')?.id, 'b');
  assert.equal(findByName(designations, ''), undefined);
  assert.equal(normaliseName('  Sr.   Manager '), 'Sr. Manager');
  // renamed: the selection follows
  assert.equal(reconcileDesignation('area head', { type: 'renamed', list: 'designation', id: 'b', from: 'Area Head', to: 'Zone Head' }, [{ name: 'State Manager' }, { name: 'Zone Head' }]), 'Zone Head');
  // removed or switched off: the selection is cleared
  assert.equal(reconcileDesignation('Area Head', { type: 'removed', list: 'designation', id: 'b', name: 'Area Head' }, [{ name: 'State Manager' }]), '');
  // unrelated change: the selection stays
  assert.equal(reconcileDesignation('State Manager', { type: 'other', list: 'designation' }, designations), 'State Manager');
  assert.equal(reconcileDesignation('', null, designations), '');
  assert.equal(reconcileDepartment('d1', [{ id: 'd1' }, { id: 'd2' }]), 'd1');
  assert.equal(reconcileDepartment('d3', [{ id: 'd1' }]), '');
  assert.equal(reconcileDepartment('', [{ id: 'd1' }]), '');
});

test('a department change never moves the designation, and a designation change never moves the department', () => {
  // The department "Sales" is renamed to "Accounts" while the designation "Sales" is selected: the designation stays.
  const departmentRename = { type: 'renamed', list: 'department', id: 'd1', from: 'Sales', to: 'Accounts' } as const;
  assert.equal(reconcileDesignation('Sales', departmentRename, [{ name: 'Sales' }, { name: 'Accounts' }]), 'Sales');
  // ...but if that designation no longer exists on the fresh list it is still cleared (never re-created by the server)
  assert.equal(reconcileDesignation('Sales', departmentRename, [{ name: 'Accounts' }]), '');
  // the department is kept by id, so a rename of a designation or of the department itself leaves it alone
  assert.equal(reconcileDepartment('d1', [{ id: 'd1' }]), 'd1');
});

test('the person is told when refreshing the lists took their selection away', () => {
  assert.equal(describeLostSelections({ orgUnitId: 'd1', designation: 'Area Head' }, { orgUnitId: 'd1', designation: 'Area Head' }), '');
  assert.equal(describeLostSelections({ orgUnitId: '', designation: '' }, { orgUnitId: '', designation: '' }), '');
  assert.match(describeLostSelections({ orgUnitId: 'd1', designation: 'Area Head' }, { orgUnitId: '', designation: 'Area Head' }), /The department you selected was removed/);
  assert.match(describeLostSelections({ orgUnitId: 'd1', designation: 'Area Head' }, { orgUnitId: 'd1', designation: '' }), /The designation you selected was removed/);
  assert.match(describeLostSelections({ orgUnitId: 'd1', designation: 'Area Head' }, { orgUnitId: '', designation: '' }), /department and designation you selected were removed/);
  // an empty selection that stays empty is not a loss
  assert.equal(describeLostSelections({ orgUnitId: '', designation: 'Area Head' }, { orgUnitId: '', designation: 'Area Head' }), '');
});

test('the form counts as dirty as soon as anything differs from how it started', () => {
  const start = createEmptyOnboardForm('2026-11-24');
  assert.equal(isOnboardFormDirty({ ...start }, start), false);
  assert.equal(isOnboardFormDirty({ ...start, fullName: 'A' }, start), true);
  assert.equal(isOnboardFormDirty({ ...start, isOfficeManager: true }, start), true);
  assert.equal(isOnboardFormDirty({ ...start, password: 'x' }, start), true);
});

test('generated passwords are 12 characters with every character class and no confusing characters', () => {
  for (let run = 0; run < 50; run += 1) {
    const password = generateTemporaryPassword();
    assert.equal(password.length, 12);
    assert.match(password, /[A-Z]/);
    assert.match(password, /[a-z]/);
    assert.match(password, /[0-9]/);
    assert.match(password, /[@#$%&*!?]/);
    assert.doesNotMatch(password, /[01OIl]/);
  }
  assert.notEqual(generateTemporaryPassword(), generateTemporaryPassword());
});

test('local date helper', () => {
  assert.equal(toDateInputValue(new Date(2026, 10, 4)), '2026-11-04');
});

test('typing a mobile number key by key keeps every digit, and too many digits are an error, not a changed number', () => {
  for (const typed of ['+91 98765 43210', '91 9876543210', '09876543210', '98765-43210']) {
    let box = '';
    for (const character of typed) box = sanitiseMobileInput(box + character);
    assert.equal(normalizeMobile(box), '9876543210', typed);
  }
  assert.equal(normalizeMobile('98765 43210 99'), '987654321099');
  assert.ok(validateOnboardForm({ ...valid, mobile: '98765 43210 99' }, { headOfficeAvailable: true }).mobile);
  assert.equal(sanitiseMobileInput('abc98765x'), '98765');
});

const NOW = new Date('2026-11-24T10:00:00.000Z');

test('date of birth is optional, must be a real date and at least 14 years back (same rule as the server)', () => {
  assert.equal(validateDateOfBirth('', NOW), '');
  assert.equal(validateDateOfBirth('1995-05-17', NOW), '');
  assert.match(validateDateOfBirth('1995-02-31', NOW), /valid date of birth/);
  assert.match(validateDateOfBirth('1939-12-31', NOW), /valid date of birth/);
  assert.match(validateDateOfBirth('not-a-date', NOW), /valid date of birth/);
  assert.match(validateDateOfBirth('2026-11-23', NOW), /at least 14 years/);
  assert.match(validateDateOfBirth('2015-01-01', NOW), /at least 14 years/);
  const latest = maxDateOfBirth(NOW);
  assert.equal(validateDateOfBirth(latest, NOW), '');
  assert.match(validateDateOfBirth('2012-11-25', NOW), /at least 14 years/);
});

test('optional details are validated only when filled in', () => {
  assert.deepEqual(validateOnboardForm(valid, { headOfficeAvailable: true }), {});
  const badDetails = validateOnboardForm({ ...valid, dateOfBirth: '2024-01-01', personalEmail: 'nope' }, { headOfficeAvailable: true });
  assert.deepEqual(Object.keys(badDetails).sort(), ['dateOfBirth', 'personalEmail']);
  assert.deepEqual(validateOnboardForm({ ...valid, preferredName: 'Ash', dateOfBirth: '1990-03-04', personalEmail: 'a@b.co' }, { headOfficeAvailable: true }), {});
});

test('optional details and the manager flag are sent only when they apply', () => {
  const plain = toOnboardPayload(valid);
  assert.equal('preferredName' in plain, false);
  assert.equal('dateOfBirth' in plain, false);
  assert.equal('personalEmail' in plain, false);
  assert.equal('isOfficeManager' in plain, false);
  const full = toOnboardPayload({ ...valid, preferredName: '  Ash   S ', dateOfBirth: '1990-03-04', personalEmail: ' a@b.co ', isOfficeManager: true });
  assert.equal(full.preferredName, 'Ash S');
  assert.equal(full.dateOfBirth, '1990-03-04');
  assert.equal(full.personalEmail, 'a@b.co');
  // A head office employee never carries the manager flag, even if it was ticked before switching location.
  assert.equal('isOfficeManager' in full, false);
  const manager = toOnboardPayload({ ...valid, locationType: 'STATE_OFFICE', stateId: '4040', cityId: '133590', isOfficeManager: true });
  assert.equal(manager.isOfficeManager, true);
  assert.equal('isOfficeManager' in toOnboardPayload({ ...valid, locationType: 'STATE_OFFICE', stateId: '4040', cityId: '133590' }), false);
});

test('a state without an office is reported only when a message is supplied', () => {
  const state = { ...valid, locationType: 'STATE_OFFICE' as const, stateId: '4040', cityId: '133590' };
  assert.deepEqual(validateOnboardForm(state, { headOfficeAvailable: true }), {});
  const blocked = validateOnboardForm(state, { headOfficeAvailable: true, stateOfficeMessage: 'Gujarat has no state office yet.' });
  assert.equal(blocked.stateId, 'Gujarat has no state office yet.');
  // The message does not apply to head office employees.
  assert.deepEqual(validateOnboardForm(valid, { headOfficeAvailable: true, stateOfficeMessage: 'x' }), {});
});

test('existing-login mode needs the login and job details but no name, email or password', () => {
  const link: OnboardForm = { ...createEmptyOnboardForm('2026-11-24'), designation: 'Executive', orgUnitId: 'dept-1' };
  const missing = validateOnboardForm(link, { headOfficeAvailable: true, mode: 'EXISTING' });
  assert.deepEqual(Object.keys(missing), ['userId']);
  assert.deepEqual(validateOnboardForm({ ...link, userId: 'user-1' }, { headOfficeAvailable: true, mode: 'EXISTING' }), {});
  // A mobile typed for a login without one must still be a real number.
  assert.ok(validateOnboardForm({ ...link, userId: 'user-1', mobile: '12345' }, { headOfficeAvailable: true, mode: 'EXISTING' }).mobile);
  assert.deepEqual(validateOnboardForm({ ...link, userId: 'user-1', mobile: '+91 98765 43210' }, { headOfficeAvailable: true, mode: 'EXISTING' }), {});
  // The same form still fails in NEW mode.
  assert.ok(validateOnboardForm({ ...link, userId: 'user-1' }, { headOfficeAvailable: true }).fullName);
});

test('existing-login payload carries the login id and never a name, email or password', () => {
  const form: OnboardForm = {
    ...createEmptyOnboardForm('2026-11-24'), userId: 'user-1', designation: ' Executive ', orgUnitId: 'dept-1',
    fullName: 'ignored', email: 'ignored@x.com', password: 'ignored-password',
    locationType: 'STATE_OFFICE', stateId: '4040', cityId: '133590', isOfficeManager: true, dateOfBirth: '1990-03-04',
  };
  const payload = toOnboardExistingPayload(form);
  assert.equal(payload.userId, 'user-1');
  assert.equal(payload.designation, 'Executive');
  assert.deepEqual([payload.stateId, payload.cityId, payload.isOfficeManager, payload.dateOfBirth], [4040, 133590, true, '1990-03-04']);
  assert.equal('mobile' in payload, false);
  for (const key of ['fullName', 'email', 'password', 'customRoleId']) assert.equal(key in payload, false, key);
  assert.equal(toOnboardExistingPayload({ ...form, mobile: '+91 98765-43210' }).mobile, '9876543210');
  assert.equal(toOnboardExistingPayload({ ...form, locationType: 'HEAD_OFFICE', stateId: '', cityId: '' }).stateId, null);
  assert.equal(toOnboardExistingPayload({ ...form, locationType: 'HEAD_OFFICE' }).stateId, 4040);
  assert.equal('isOfficeManager' in toOnboardExistingPayload({ ...form, locationType: 'HEAD_OFFICE' }), false);
});

test('ticking State Manager fills the designation only where none is chosen', () => {
  const defaults = { designation: 'State Manager' };
  assert.deepEqual(getStateManagerDefaults({ designation: '' }, defaults), { designation: 'State Manager' });
  assert.deepEqual(getStateManagerDefaults({ designation: ' Zonal Head ' }, defaults), {});
  assert.deepEqual(getStateManagerDefaults({ designation: '' }, { designation: '' }), {});
});

test('the form explains who a State Manager reports to, and asks only when there are several', () => {
  assert.deepEqual(describeNationalManager([{ name: 'Ravi Patel' }]), { tone: 'ok', text: 'Reports to Ravi Patel (National Operations Manager) by default.' });
  const none = describeNationalManager([]);
  assert.equal(none.tone, 'warn');
  assert.match(none.text, /No National Operations Manager is set yet/);
  const several = describeNationalManager([{ name: 'A' }, { name: 'B' }]);
  assert.equal(several.tone, 'warn');
  assert.match(several.text, /several National Operations Managers. Choose below/);
});

test('login details text carries the credentials and the change-password reminder', () => {
  const text = buildLoginDetailsText({ employeeCode: 'EMP-0002', name: 'Asha', email: 'a@b.com', password: 'Pw@12345', portalUrl: 'https://x.test' });
  assert.match(text, /Employee ID: EMP-0002/);
  assert.match(text, /Temporary password: Pw@12345/);
  assert.match(text, /change the password/);
});

test('the email check is the server\'s rule: what it accepts the server accepts, and the reverse', () => {
  for (const ok of ['asha@example.com', ' asha@example.com ', 'a@b.co', "o'brien+tag@example.co.in", 'first.last@sub.example.org', 'a_b@x-y.com']) assert.equal(isValidEmail(ok), true, ok);
  for (const bad of ['asha@', 'asha', '@example.com', 'a b@example.com', 'a..b@example.com', '.a@example.com', 'a.@example.com', 'a@b', 'a@b.c', 'a@-b.com', 'a@b..com', 'a@@b.com']) assert.equal(isValidEmail(bad), false, bad);
  assert.ok(validateOnboardForm({ ...valid, email: 'a..b@example.com' }, { headOfficeAvailable: true }).email);
  assert.ok(validateOnboardForm({ ...valid, personalEmail: 'a..b@example.com' }, { headOfficeAvailable: true }).personalEmail);
  assert.equal(validateOnboardForm({ ...valid, personalEmail: 'ash.s@example.com' }, { headOfficeAvailable: true }).personalEmail, undefined);
});

test('joining date follows the server rule: a real date, not before 1950, at most a year ahead', () => {
  const now = new Date('2026-11-24T10:00:00.000Z');
  assert.equal(maxJoiningDate(now), '2027-11-25');
  assert.equal(validateJoiningDate('2026-11-24', now), '');
  assert.equal(validateJoiningDate('1950-01-01', now), '');
  assert.equal(validateJoiningDate('2027-11-25', now), '');
  assert.match(validateJoiningDate('', now), /Select the joining date/);
  assert.match(validateJoiningDate('2026-02-31', now), /valid joining date/);
  assert.match(validateJoiningDate('1949-12-31', now), /valid joining date/);
  assert.match(validateJoiningDate('2027-11-26', now), /at most one year ahead/);
  // The form uses the real clock: a date far in the future is refused, today is accepted.
  assert.ok(validateOnboardForm({ ...valid, joiningDate: '2099-01-01' }, { headOfficeAvailable: true }).joiningDate);
  assert.equal(validateOnboardForm({ ...valid, joiningDate: toDateInputValue(new Date()) }, { headOfficeAvailable: true }).joiningDate, undefined);
});

test('unticking State Manager takes back only the designation the tick filled in', () => {
  assert.deepEqual(revertStateManagerDefaults({ designation: 'State Manager' }, 'State Manager'), { designation: '' });
  assert.deepEqual(revertStateManagerDefaults({ designation: ' state   manager ' }, 'State Manager'), { designation: '' });
  // Nothing was filled in by the tick, or the person chose something else afterwards: left alone.
  assert.deepEqual(revertStateManagerDefaults({ designation: 'State Manager' }, null), {});
  assert.deepEqual(revertStateManagerDefaults({ designation: 'Zonal Head' }, 'State Manager'), {});
  assert.deepEqual(revertStateManagerDefaults({ designation: '' }, 'State Manager'), {});
});

test('a state with no office, or a switched-off one, is described for the form', () => {
  const gujarat = { name: 'Gujarat', hasOffice: true, officeSwitchedOff: false };
  assert.deepEqual(describeStateOffice(gujarat, true), { error: null, note: null });
  assert.deepEqual(describeStateOffice(undefined, true), { error: null, note: null });
  assert.deepEqual(describeStateOffice({ name: 'Goa', hasOffice: false, officeSwitchedOff: false }, true), { error: null, note: 'A state office will be created for Goa when you save.' });
  assert.match(describeStateOffice({ name: 'Goa', hasOffice: false, officeSwitchedOff: false }, false).error ?? '', /Goa has no state office yet\. Ask an administrator/);
  // Switched off blocks for everybody, including an administrator, and never promises to create one.
  for (const canManageOrg of [true, false]) {
    const result = describeStateOffice({ name: 'Assam', hasOffice: false, officeSwitchedOff: true }, canManageOrg);
    assert.equal(result.error, 'The Assam state office is switched off. Switch it on from the Organisation page first.');
    assert.equal(result.note, null);
  }
  assert.equal(stateOptionLabel(gujarat), 'Gujarat');
  assert.equal(stateOptionLabel({ name: 'Goa', hasOffice: false, officeSwitchedOff: false }), 'Goa · No office yet');
  assert.equal(stateOptionLabel({ name: 'Assam', hasOffice: false, officeSwitchedOff: true }), 'Assam · Office switched off');
});

test('server validation errors land on their own field; the personal email never goes to the login email', () => {
  const allowed = ['fullName', 'email', 'mobile', 'personalEmail', 'dateOfBirth'] as const;
  const error = { response: { data: { error: 'Please check the request.', details: [
    { path: 'personalEmail', message: 'Enter a valid personal email address.' },
    { path: 'dateOfBirth', message: 'Enter a valid date of birth.' },
    { path: 'isOfficeManager', message: 'Only a state office has a manager.' },
    { path: 'body', message: 'Unrecognized key' },
  ] } } };
  const { fields, unmapped } = extractFieldErrors(error, allowed);
  assert.equal(fields.email, undefined);
  assert.deepEqual(fields, { personalEmail: 'Enter a valid personal email address.', dateOfBirth: 'Enter a valid date of birth.' });
  assert.deepEqual(unmapped, ['isOfficeManager: Only a state office has a manager.', 'Unrecognized key']);
  // The first message of a field wins; an error without details yields nothing.
  assert.deepEqual(extractFieldErrors({ response: { data: { details: [{ path: 'email', message: 'a' }, { path: 'email', message: 'b' }] } } }, allowed).fields, { email: 'a' });
  assert.deepEqual(extractFieldErrors(new Error('network'), allowed), { fields: {}, unmapped: [] });
  assert.deepEqual(extractFieldErrors({ response: { data: { details: 'x' } } }, allowed), { fields: {}, unmapped: [] });
});

test('a server message without field details goes to the right box', () => {
  assert.equal(fieldForServerMessage('Email address is already in use.', 'NEW'), 'email');
  assert.equal(fieldForServerMessage('Enter a valid personal email address.', 'NEW'), 'personalEmail');
  assert.equal(fieldForServerMessage('Enter a valid personal email address.', 'EXISTING'), 'personalEmail');
  assert.equal(fieldForServerMessage('Mobile number is already in use.', 'NEW'), 'mobile');
  assert.equal(fieldForServerMessage('That login has no email address. Add one on the Users page first.', 'EXISTING'), null);
  assert.equal(fieldForServerMessage('Something else went wrong.', 'NEW'), null);
});

test('a phone number typed with +91, 91 or a leading 0 is searched by its plain digits', () => {
  assert.equal(normaliseLoginSearch('+91 98765 43210'), '9876543210');
  assert.equal(normaliseLoginSearch('91 98765 43210'), '9876543210');
  assert.equal(normaliseLoginSearch('098765 43210'), '9876543210');
  assert.equal(normaliseLoginSearch('98765-43210'), '9876543210');
  assert.equal(normaliseLoginSearch('+91 98765'), '98765');
  // Not clearly a phone number: sent as typed (trimmed).
  assert.equal(normaliseLoginSearch('  Asha Singh '), 'Asha Singh');
  assert.equal(normaliseLoginSearch('asha@example.com'), 'asha@example.com');
  assert.equal(normaliseLoginSearch('98765'), '98765');
  assert.equal(normaliseLoginSearch(''), '');
});

test('a State Manager needs a chosen National Operations Manager only when there are several', () => {
  const stateManager: OnboardForm = {
    ...createEmptyOnboardForm('2026-11-24'),
    fullName: 'Asha Rao', mobile: '9876543210', email: 'asha@example.com', password: 'Strong#Pass1',
    designation: 'State Manager', orgUnitId: 'dept-1', locationType: 'STATE_OFFICE', stateId: '4040', cityId: '133590', isOfficeManager: true,
  };
  assert.equal(validateOnboardForm(stateManager, { headOfficeAvailable: true, nationalManagerCount: 1 }).nationalManagerId, undefined);
  assert.equal(validateOnboardForm(stateManager, { headOfficeAvailable: true, nationalManagerCount: 0 }).nationalManagerId, undefined);
  assert.match(validateOnboardForm(stateManager, { headOfficeAvailable: true, nationalManagerCount: 2 }).nationalManagerId ?? '', /National Operations Manager/);
  assert.equal(validateOnboardForm({ ...stateManager, nationalManagerId: 'nom-2' }, { headOfficeAvailable: true, nationalManagerCount: 2 }).nationalManagerId, undefined);

  assert.equal(toOnboardPayload({ ...stateManager, nationalManagerId: 'nom-2' }).managerEmployeeId, 'nom-2');
  assert.equal('managerEmployeeId' in toOnboardPayload(stateManager), false, 'one or none: the server decides');
  // Not a State Manager (or head office): a stale choice is never sent.
  assert.equal('managerEmployeeId' in toOnboardPayload({ ...stateManager, isOfficeManager: false, nationalManagerId: 'nom-2' }), false);
  assert.equal(toOnboardExistingPayload({ ...stateManager, userId: 'u1', nationalManagerId: 'nom-1' }).managerEmployeeId, 'nom-1');
});

test('the server\'s managerEmployeeId error lands on the National Operations Manager field', () => {
  const error = { response: { data: { details: [{ path: ['managerEmployeeId'], message: 'Choose who this State Manager reports to.' }] } } };
  const { fields, unmapped } = extractFieldErrors(error, ['nationalManagerId', 'designation']);
  assert.equal(fields.nationalManagerId, 'Choose who this State Manager reports to.');
  assert.deepEqual(unmapped, []);
});
