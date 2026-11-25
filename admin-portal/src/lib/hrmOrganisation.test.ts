import assert from 'node:assert/strict';
import test from 'node:test';

import type { HrmOrganisation, HrmOrganisationUnit } from './hrmApi';
import {
  addCustomDepartment, buildStateRows, countStateRows, departmentsOf, describeSetupResult, describeSkippedState, describeStateOfficesResult,
  filterStateRows, formatManagerNames, getHrmBase, groupOrganisation, officeHref, statesWithoutOffice, summariseOrganisation,
} from './hrmOrganisation';

const unit = (overrides: Partial<HrmOrganisationUnit>): HrmOrganisationUnit => ({
  id: 'u', code: 'C', name: 'Unit', type: 'DEPARTMENT', kind: 'DEPARTMENT', isActive: true, parent: null, state: null, city: null,
  managers: [], childCount: 0, employeeCount: 0, coverage: null, ...overrides,
});

const ravi = { id: 'm', employeeCode: 'EMP-1', name: 'Ravi Patel' };

const units: HrmOrganisationUnit[] = [
  unit({ id: 'ho', name: 'Raipur Head Office', kind: 'HEAD_OFFICE', type: 'HEAD_OFFICE', state: { id: 1, name: 'Chhattisgarh' }, city: { id: 2, name: 'Raipur' }, employeeCount: 4 }),
  unit({ id: 'd1', name: 'Finance', parent: { id: 'ho', name: 'Raipur Head Office' } }),
  unit({ id: 'd2', name: 'Sales', parent: { id: 'ho', name: 'Raipur Head Office' }, isActive: false }),
  unit({ id: 's1', code: 'ST-GJ', name: 'Gujarat State Office', kind: 'STATE', type: 'REGION', state: { id: 3, name: 'Gujarat' }, managers: [ravi], coverage: 'COVERED', employeeCount: 5 }),
  unit({ id: 's2', code: 'ST-MH', name: 'Maharashtra State Office', kind: 'STATE', type: 'REGION', state: { id: 5, name: 'Maharashtra' }, managers: [], coverage: 'VACANT', employeeCount: 2 }),
  unit({ id: 's3', code: 'ST-RJ', name: 'Rajasthan State Office', kind: 'STATE', type: 'REGION', state: { id: 6, name: 'Rajasthan' }, isActive: false, employeeCount: 0 }),
  unit({ id: 't1', name: 'Night shift', kind: 'OTHER', type: 'TEAM' }),
];

const states = [
  { id: 1, name: 'Chhattisgarh' }, { id: 3, name: 'Gujarat' }, { id: 4, name: 'Kerala' }, { id: 5, name: 'Maharashtra' }, { id: 6, name: 'Rajasthan' },
];

const organisation = {
  units, states, indiaStateCount: 5,
  availableStates: [{ id: 1, name: 'Chhattisgarh' }, { id: 4, name: 'Kerala' }, { id: 6, name: 'Rajasthan' }],
  coverage: { unplacedStaff: 3 },
} as unknown as HrmOrganisation;

test('units are grouped into the page sections and inactive ones are hidden unless asked for', () => {
  const groups = groupOrganisation(units);
  assert.deepEqual([groups.headOffices.length, groups.departments.length, groups.states.length, groups.others.length], [1, 1, 2, 1]);
  assert.equal(groupOrganisation(units, { showInactive: true }).departments.length, 2);
  assert.equal(groupOrganisation(units, { showInactive: true }).states.length, 3);
});

test('search looks at name, code, state, city, managers and head office', () => {
  assert.deepEqual(groupOrganisation(units, { query: 'guj' }).states.map((item) => item.id), ['s1']);
  assert.deepEqual(groupOrganisation(units, { query: 'ravi' }).states.map((item) => item.id), ['s1']);
  assert.deepEqual(groupOrganisation(units, { query: 'raipur' }).departments.map((item) => item.id), ['d1']);
  assert.equal(groupOrganisation(units, { query: 'nothing here' }).departments.length, 0);
});

test('summary counts coverage from the active state offices and keeps the unplaced staff from the server', () => {
  assert.deepEqual(summariseOrganisation(organisation), {
    headOffice: units[0], departments: 1, stateOffices: 2, totalStates: 5, covered: 1, vacant: 1, joiningSoon: 0, notSetUp: 3,
    staffInStates: 7, staffInHeadOffice: 4, unplacedStaff: 3, inactive: 1,
  });
  const noCoverage = { ...organisation, coverage: undefined } as unknown as HrmOrganisation;
  assert.equal(summariseOrganisation(noCoverage).unplacedStaff, 0);
  assert.deepEqual(departmentsOf(units, 'ho').map((item) => item.id), ['d1']);
});

test('every state gets a row, whether it has an office, a vacant office, a switched-off office or none', () => {
  const rows = buildStateRows(organisation);
  assert.deepEqual(rows.map((row) => [row.stateName, row.status]), [
    ['Chhattisgarh', 'NOT_SET_UP'], ['Gujarat', 'COVERED'], ['Kerala', 'NOT_SET_UP'], ['Maharashtra', 'VACANT'], ['Rajasthan', 'SWITCHED_OFF'],
  ]);
  assert.equal(rows[0]!.unit, null);
  assert.deepEqual(rows[1]!.managers, [ravi]);
  assert.equal(rows[1]!.employeeCount, 5);
  assert.equal(rows[4]!.unit?.id, 's3');
});

test('the active office wins when a state also has a switched-off one, and a missing coverage is worked out from managers', () => {
  const both = { states: [{ id: 3, name: 'Gujarat' }], units: [
    unit({ id: 'old', kind: 'STATE', type: 'REGION', state: { id: 3, name: 'Gujarat' }, isActive: false }),
    unit({ id: 'new', kind: 'STATE', type: 'REGION', state: { id: 3, name: 'Gujarat' }, managers: [ravi], coverage: null }),
  ] };
  const [row] = buildStateRows(both);
  assert.equal(row!.unit?.id, 'new');
  assert.equal(row!.status, 'COVERED');
});

test('state rows are filtered by status chip and by search text', () => {
  const rows = buildStateRows(organisation);
  assert.equal(filterStateRows(rows, 'ALL').length, 5);
  assert.deepEqual(filterStateRows(rows, 'COVERED').map((row) => row.stateName), ['Gujarat']);
  assert.deepEqual(filterStateRows(rows, 'VACANT').map((row) => row.stateName), ['Maharashtra']);
  // "Not set up" also lists the state whose office is switched off
  assert.deepEqual(filterStateRows(rows, 'NOT_SET_UP').map((row) => row.stateName), ['Chhattisgarh', 'Kerala', 'Rajasthan']);
  assert.deepEqual(filterStateRows(rows, 'ALL', 'ker').map((row) => row.stateName), ['Kerala']);
  assert.deepEqual(filterStateRows(rows, 'ALL', 'ravi').map((row) => row.stateName), ['Gujarat']);
  assert.deepEqual(filterStateRows(rows, 'ALL', 'st-mh').map((row) => row.stateName), ['Maharashtra']);
  assert.equal(filterStateRows(rows, 'VACANT', 'guj').length, 0);
});

test('chip counts follow the search text', () => {
  const rows = buildStateRows(organisation);
  assert.deepEqual(countStateRows(rows), { ALL: 5, COVERED: 1, VACANT: 1, NOT_SET_UP: 3 });
  assert.deepEqual(countStateRows(rows, 'a'), { ALL: 5, COVERED: 1, VACANT: 1, NOT_SET_UP: 3 });
  assert.deepEqual(countStateRows(rows, 'maha'), { ALL: 1, COVERED: 0, VACANT: 1, NOT_SET_UP: 0 });
});

test('manager names are shortened after the second one', () => {
  assert.equal(formatManagerNames([]), '');
  assert.equal(formatManagerNames([{ name: 'A' }, { name: 'B' }]), 'A, B');
  assert.equal(formatManagerNames([{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }]), 'A, B +2');
});

test('a new state office is offered only for states with no office at all', () => {
  assert.deepEqual(statesWithoutOffice(organisation).map((state) => state.name), ['Chhattisgarh', 'Kerala']);
});

test('links stay in the portal the page is open in', () => {
  assert.equal(getHrmBase('/employee/hrm/organisation'), '/employee/hrm');
  assert.equal(getHrmBase('/admin/hrm/organisation'), '/admin/hrm');
  assert.equal(getHrmBase(null), '/admin/hrm');
  assert.equal(officeHref('/admin/hrm', 'abc 1'), '/admin/hrm/organisation/offices/abc%201');
});

test('setup result is described in one line', () => {
  assert.equal(describeSetupResult({ headOffice: { id: 'x', name: 'Raipur Head Office' }, createdHeadOffice: true, createdDepartments: ['A', 'B'], skippedDepartments: ['C'], adoptedDepartments: ['C'] }), 'Raipur Head Office created · 2 departments added · 1 already existed · 1 moved under the head office');
  assert.equal(describeSetupResult({ headOffice: { id: 'x', name: 'Raipur Head Office' }, createdHeadOffice: false, createdDepartments: [], skippedDepartments: [], adoptedDepartments: [] }), 'Raipur Head Office already set up · no new departments');
});

test('the result of adding several state offices is described, with a reason for every skipped state', () => {
  assert.equal(describeStateOfficesResult({ created: [{ id: 'a', name: 'A', stateId: 1 }], skipped: [] }), '1 state office added');
  assert.equal(describeStateOfficesResult({ created: [{ id: 'a', name: 'A', stateId: 1 }, { id: 'b', name: 'B', stateId: 2 }], skipped: [{ stateId: 3, name: 'C', reason: 'EXISTS' }] }), '2 state offices added · 1 skipped');
  assert.equal(describeStateOfficesResult({ created: [], skipped: [{ stateId: 3, name: 'C', reason: 'EXISTS' }] }), 'No new state offices · 1 skipped');
  assert.match(describeSkippedState({ stateId: 3, name: 'Gujarat', reason: 'EXISTS' }), /Gujarat.*already has/);
  assert.match(describeSkippedState({ stateId: 3, name: 'Gujarat', reason: 'SWITCHED_OFF' }), /Gujarat.*switched off/);
});

test('a custom department is trimmed and repeats are refused', () => {
  assert.deepEqual(addCustomDepartment(['Sales'], '  Legal   Team '), { names: ['Sales', 'Legal Team'], error: '' });
  assert.match(addCustomDepartment(['Sales'], 'sales').error, /already/);
  assert.match(addCustomDepartment([], 'x').error, /at least 2/);
});

test('a vacant state office with a State Manager joining is counted as joining soon and lists who is coming', () => {
  const joining = { id: 'e9', employeeCode: 'EMP-0009', name: 'Asha', joiningDate: '2026-12-01T00:00:00.000Z' };
  const withJoining = { ...organisation, units: organisation.units.map((unit) => (unit.coverage === 'VACANT' ? { ...unit, upcomingManagers: [joining] } : unit)) } as HrmOrganisation;
  assert.equal(summariseOrganisation(withJoining).joiningSoon, 1);
  assert.equal(summariseOrganisation(withJoining).vacant, 1, 'still vacant today');
  const vacantRow = buildStateRows(withJoining).find((row) => row.status === 'VACANT');
  assert.deepEqual(vacantRow?.upcomingManagers, [joining]);
  assert.ok(buildStateRows(withJoining).filter((row) => row.status !== 'VACANT').every((row) => row.upcomingManagers.length === 0));
});
