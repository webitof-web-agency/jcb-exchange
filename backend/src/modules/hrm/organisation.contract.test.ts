import assert from 'node:assert/strict';
import test from 'node:test';
import { buildUnitCode, defaultStateOfficeName, kindOfUnit, normaliseNames, slugForCode } from './organisationCodes';
import { HrmValidationError, parseHrmInput, schemas } from './validation';

test('unit codes are readable, upper case and unique', () => {
  assert.equal(slugForCode('Sales & Marketing'), 'SALES-AND-MARKETING');
  assert.equal(slugForCode('  '), 'UNIT');
  assert.equal(slugForCode('Human Resources (HR)'), 'HUMAN-RESOURCES-HR');
  assert.ok(slugForCode('x'.repeat(80)).length <= 24);
  assert.equal(buildUnitCode('DEPT', 'Finance', new Set()), 'DEPT-FINANCE');
  assert.equal(buildUnitCode('DEPT', 'Finance', new Set(['DEPT-FINANCE'])), 'DEPT-FINANCE-2');
  assert.equal(buildUnitCode('DEPT', 'Finance', new Set(['DEPT-FINANCE', 'DEPT-FINANCE-2'])), 'DEPT-FINANCE-3');
  assert.ok(buildUnitCode('DEPT', 'x'.repeat(80), new Set()).length <= 40);
});

test('department names are cleaned and de-duplicated ignoring case', () => {
  assert.deepEqual(normaliseNames(['  Sales ', 'sales', 'Human   Resources', 'x', '', 'HUMAN RESOURCES', 'Finance']), ['Sales', 'Human Resources', 'Finance']);
});

test('units are classified as head office, state office, department or other', () => {
  assert.equal(kindOfUnit({ type: 'HEAD_OFFICE', stateId: 4040 }), 'HEAD_OFFICE');
  assert.equal(kindOfUnit({ type: 'DEPARTMENT', stateId: null }), 'DEPARTMENT');
  assert.equal(kindOfUnit({ type: 'REGION', stateId: 4040 }), 'STATE');
  assert.equal(kindOfUnit({ type: 'REGION', stateId: null }), 'OTHER');
  assert.equal(kindOfUnit({ type: 'TEAM', stateId: null }), 'OTHER');
  assert.equal(defaultStateOfficeName('Gujarat'), 'Gujarat State Office');
});

test('create-unit input needs the right fields for each kind', () => {
  const ok = (value: unknown) => parseHrmInput(schemas.createOrganisationUnit, value);
  const bad = (value: unknown, pattern: RegExp) => assert.throws(() => ok(value), (error: unknown) => error instanceof HrmValidationError && pattern.test(error.message));
  assert.doesNotThrow(() => ok({ kind: 'DEPARTMENT', name: 'Finance' }));
  assert.doesNotThrow(() => ok({ kind: 'STATE', stateId: 1 }));
  assert.doesNotThrow(() => ok({ kind: 'HEAD_OFFICE', name: 'Raipur Head Office', stateId: 4040, cityId: 133590 }));
  bad({ kind: 'DEPARTMENT' }, /name/);
  bad({ kind: 'STATE' }, /stateId/);
  bad({ kind: 'HEAD_OFFICE', name: 'HO', stateId: 1 }, /cityId/);
  bad({ kind: 'BRANCH', name: 'x' }, /kind/);
  bad({ kind: 'DEPARTMENT', name: 'Finance', code: 'DEPT-X' }, /./);
});

test('update-unit and head-office-setup input are strict', () => {
  assert.doesNotThrow(() => parseHrmInput(schemas.updateOrganisationUnit, { name: 'Finance & Accounts' }));
  assert.doesNotThrow(() => parseHrmInput(schemas.updateOrganisationUnit, { isActive: false }));
  assert.throws(() => parseHrmInput(schemas.updateOrganisationUnit, {}), (error: unknown) => error instanceof HrmValidationError);
  assert.throws(() => parseHrmInput(schemas.updateOrganisationUnit, { code: 'X' }), (error: unknown) => error instanceof HrmValidationError);
  const place = { stateId: 1, cityId: 2 };
  assert.deepEqual(parseHrmInput(schemas.headOfficeSetup, { ...place, departments: [' Sales ', 'Finance'] }).departments, ['Sales', 'Finance']);
  // Names are cleaned (control / bidi characters out) and must hold a letter or number, never markup.
  assert.equal(parseHrmInput(schemas.updateOrganisationUnit, { name: '  Finance\u202e   Team\u0007 ' }).name, 'Finance Team');
  for (const name of ['<b>HR</b>', '---', 'x']) {
    assert.throws(() => parseHrmInput(schemas.updateOrganisationUnit, { name }), (error: unknown) => error instanceof HrmValidationError, name);
  }
  assert.equal(parseHrmInput(schemas.updateOrganisationUnit, { name: 'मानव संसाधन' }).name, 'मानव संसाधन');
  // The place is chosen by the administrator: nothing is assumed.
  assert.throws(() => parseHrmInput(schemas.headOfficeSetup, { departments: [] }), (error: unknown) => error instanceof HrmValidationError);
  assert.throws(() => parseHrmInput(schemas.updateOrganisationUnit, { stateId: 1 }), (error: unknown) => error instanceof HrmValidationError);
  assert.throws(() => parseHrmInput(schemas.headOfficeSetup, { ...place, departments: Array.from({ length: 31 }, (_, index) => `Dept ${index}`) }), (error: unknown) => error instanceof HrmValidationError);
});
