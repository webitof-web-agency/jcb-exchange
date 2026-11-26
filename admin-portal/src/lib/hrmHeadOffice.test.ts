import assert from 'node:assert/strict';
import test from 'node:test';

import { defaultHeadOffice, headOfficeForPosting, headOfficeLabel, headOfficePlace, headOfficeProblem, selectedHeadOffice, type HrmHeadOffice } from './hrmHeadOffice';
import { groupOrganisation, summariseOrganisation } from './hrmOrganisation';
import { selectableOffices } from './hrmLifecycle';
import type { HrmOrganisation, HrmOrganisationUnit } from './hrmApi';

const office = (id: string, isDefault: boolean, patch: Partial<HrmHeadOffice> = {}): HrmHeadOffice =>
  ({ id, name: id.toUpperCase(), isDefault, stateId: 1, stateName: 'Chhattisgarh', cityId: 2, cityName: 'Raipur', ...patch });

test('the default is chosen unless another one was picked and is still offered', () => {
  const list = [office('a', false), office('b', true)];
  assert.equal(defaultHeadOffice(list)?.id, 'b');
  assert.equal(defaultHeadOffice([office('a', false)])?.id, 'a', 'nothing marked: the first');
  assert.equal(defaultHeadOffice([]), null);
  assert.equal(selectedHeadOffice(list, '')?.id, 'b');
  assert.equal(selectedHeadOffice(list, 'a')?.id, 'a');
  assert.equal(selectedHeadOffice(list, 'switched-off')?.id, 'b');
});

test('a saved posting: the named office, else (when it names none) the one at its place, else the default', () => {
  const list = [office('a', true), office('b', false, { stateId: 9, cityId: 90 })];
  const at = (headOfficeUnitId: string, stateId: string, cityId: string) => headOfficeForPosting(list, { headOfficeUnitId, stateId, cityId })?.id;
  assert.equal(at('b', '1', '2'), 'b');
  assert.equal(at('', '9', '90'), 'b', 'an older offer keeps its place');
  assert.equal(at('', '7', '70'), 'a');
  assert.equal(at('', '', ''), 'a');
  assert.equal(at('switched-off', '9', '90'), 'a', 'a named office that is gone: the default');
  assert.equal(headOfficeForPosting([], { headOfficeUnitId: '', stateId: '', cityId: '' }), null);
});

test('how an office reads, and when it cannot be used', () => {
  assert.equal(headOfficePlace(office('a', true)), 'Raipur, Chhattisgarh');
  assert.equal(headOfficeLabel(office('a', true)), 'A · Raipur, Chhattisgarh');
  assert.equal(headOfficeLabel(office('a', true, { cityName: null, stateName: null })), 'A · state and city not set');
  assert.equal(headOfficeProblem(office('a', true)), null);
  assert.match(headOfficeProblem(office('a', true, { cityId: null })) ?? '', /no state and city/);
  assert.equal(headOfficeProblem(null), null);
});

test('lists put the default head office first', () => {
  const unit = (id: string, kind: string, isDefault: boolean): HrmOrganisationUnit => ({ id, name: id, code: id, type: kind, kind, isActive: true, isDefault, managers: [], employeeCount: 0, childCount: 0 } as unknown as HrmOrganisationUnit);
  const units = [unit('alpha', 'HEAD_OFFICE', false), unit('zulu', 'HEAD_OFFICE', true), unit('gujarat', 'STATE', false)];
  assert.deepEqual(groupOrganisation(units, { query: '', showInactive: false }).headOffices.map((item) => item.id), ['zulu', 'alpha']);
  assert.deepEqual(selectableOffices(units).map((item) => item.id), ['zulu', 'alpha', 'gujarat']);
  const summary = summariseOrganisation({ units, states: [], availableStates: [], coverage: { totalStates: 0, officesSetUp: 0, covered: 0, vacant: 0, coveredByCharge: 0, notSetUp: 0, staffInStates: 0, staffInHeadOffice: 0, unplacedStaff: 0 } } as unknown as HrmOrganisation);
  assert.equal(summary.headOffice?.id, 'zulu');
});
