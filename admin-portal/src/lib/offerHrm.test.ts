import assert from 'node:assert/strict';
import test from 'node:test';

import {
  allowedOfferStatusChanges,
  appendOfferHrmFields,
  buildPlaceOfPosting,
  canDeleteOffer,
  canEditOffer,
  createEmptyOfferHrmForm,
  letterSalaryFromBreakup,
  nextCustomComponentCode,
  offerHrmFormFromStored,
  salaryTotals,
  statusChangeNeedsReason,
  validateOfferHrmForm,
} from './offerHrm';

const options = {
  designations: [{ id: 'd1', name: 'Sales Executive' }, { id: 'd2', name: 'State Manager' }],
  states: [{ id: 1, name: 'Maharashtra', hasOffice: true, officeSwitchedOff: false }, { id: 2, name: 'Goa', hasOffice: false, officeSwitchedOff: true }],
  headOffices: [{ id: 'ho', name: 'Head Office', isDefault: true, stateId: 9, stateName: 'Chhattisgarh', cityId: 90, cityName: 'Raipur' }, { id: 'ho-2', name: 'New Office', isDefault: false, stateId: null, stateName: null, cityId: null, cityName: null }],
};

test('offer status actions mirror the backend rules', () => {
  assert.deepEqual(allowedOfferStatusChanges('SENT'), ['SENT', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'WITHDRAWN']);
  assert.deepEqual(allowedOfferStatusChanges('ACCEPTED'), []);
  assert.equal(canEditOffer('ACCEPTED'), false);
  assert.equal(canEditOffer('EXPIRED'), true);
  assert.equal(canDeleteOffer('ACCEPTED'), false);
  assert.equal(statusChangeNeedsReason('WITHDRAWN'), true);
  assert.equal(statusChangeNeedsReason('EXPIRED'), false);
});

test('salary totals and the amount printed on the letter', () => {
  const rows = [
    { code: 'BASIC', name: 'Basic salary', componentType: 'EARNING' as const, monthlyAmount: '20,000' },
    { code: 'HRA', name: 'HRA', componentType: 'EARNING' as const, monthlyAmount: '8000' },
    { code: 'PF_EMPLOYER', name: 'PF', componentType: 'EMPLOYER_CONTRIBUTION' as const, monthlyAmount: '1800' },
    { code: 'SPECIAL', name: 'Special', componentType: 'EARNING' as const, monthlyAmount: '' },
  ];
  assert.deepEqual(salaryTotals(rows), { grossMonthly: 28000, ctcMonthly: 29800, annualCtc: 357600 });
  assert.equal(letterSalaryFromBreakup(rows, 'month'), '29800');
  assert.equal(letterSalaryFromBreakup(rows, 'annum'), '357600');
  assert.equal(nextCustomComponentCode([{ ...rows[0]!, code: 'OTHER_1' }]), 'OTHER_2');
});

test('placement checks', () => {
  const form = { ...createEmptyOfferHrmForm(), salaryComponents: [] };
  assert.deepEqual(Object.keys(validateOfferHrmForm(form, '', options)).sort(), ['designation', 'hrmOrgUnitId', 'locationType']);
  assert.match(validateOfferHrmForm({ ...form, hrmOrgUnitId: 'x', locationType: 'STATE_OFFICE' }, 'Sales Executive', options).stateId ?? '', /state/i);
  assert.match(validateOfferHrmForm({ ...form, hrmOrgUnitId: 'x', locationType: 'STATE_OFFICE', stateId: '2', cityId: '5' }, 'Sales Executive', options).stateId ?? '', /switched off/);
  assert.match(validateOfferHrmForm({ ...form, hrmOrgUnitId: 'x', locationType: 'HEAD_OFFICE' }, 'Typo Title', options).designation ?? '', /HRM list/);
  assert.deepEqual(validateOfferHrmForm({ ...form, hrmOrgUnitId: 'x', locationType: 'HEAD_OFFICE' }, 'sales executive', options), {});
  // A head office without a state and city cannot take an offer; no head office at all means state office only.
  assert.match(validateOfferHrmForm({ ...form, hrmOrgUnitId: 'x', locationType: 'HEAD_OFFICE', headOfficeUnitId: 'ho-2' }, 'Sales Executive', options).headOfficeUnitId ?? '', /no state and city/);
  assert.match(validateOfferHrmForm({ ...form, hrmOrgUnitId: 'x', locationType: 'HEAD_OFFICE' }, 'Sales Executive', { ...options, headOffices: [] }).locationType ?? '', /not set up/);
  assert.match(validateOfferHrmForm({ ...form, hrmOrgUnitId: 'x', locationType: 'HEAD_OFFICE', salaryComponents: [{ code: 'PF_EMPLOYER', name: 'PF', componentType: 'EMPLOYER_CONTRIBUTION', monthlyAmount: '100' }] }, 'Sales Executive', options).salaryComponents ?? '', /earning/);
});

test('place of posting text and the multipart fields', () => {
  assert.equal(buildPlaceOfPosting({ locationType: 'HEAD_OFFICE' }, { cityName: 'Raipur', stateName: 'Chhattisgarh' }), 'Head Office, Raipur, Chhattisgarh');
  assert.equal(buildPlaceOfPosting({ locationType: 'STATE_OFFICE' }, { cityName: 'Pune', stateName: 'Maharashtra' }), 'Pune, Maharashtra');

  const payload = new FormData();
  appendOfferHrmFields(payload, {
    ...createEmptyOfferHrmForm(), hrmOrgUnitId: 'dept', locationType: 'HEAD_OFFICE', isOfficeManager: true,
    salaryComponents: [{ code: 'basic', name: ' Basic ', componentType: 'EARNING', monthlyAmount: '1,000' }, { code: 'HRA', name: 'HRA', componentType: 'EARNING', monthlyAmount: '' }],
  });
  assert.equal(payload.get('isOfficeManager'), 'false', 'only a state office has a manager');
  const named = new FormData();
  appendOfferHrmFields(named, { ...createEmptyOfferHrmForm(), locationType: 'HEAD_OFFICE', headOfficeUnitId: 'ho' });
  assert.equal(named.get('headOfficeUnitId'), 'ho');
  const state = new FormData();
  appendOfferHrmFields(state, { ...createEmptyOfferHrmForm(), locationType: 'STATE_OFFICE', headOfficeUnitId: 'ho' });
  assert.equal(state.get('headOfficeUnitId'), '', 'a state office names no head office');
  assert.equal(offerHrmFormFromStored({ hrmOrgUnitId: 'd', locationType: 'HEAD_OFFICE', headOfficeUnitId: 'ho-2', stateId: 1, cityId: 2, isOfficeManager: false, employmentType: null, reportingManagerEmployeeId: null }, []).headOfficeUnitId, 'ho-2');
  assert.deepEqual(JSON.parse(String(payload.get('salaryComponents'))), [{ code: 'BASIC', name: 'Basic', componentType: 'EARNING', monthlyAmount: 1000 }]);
});

test('a stored offer fills the form; an old offer gets the defaults', () => {
  const restored = offerHrmFormFromStored(
    { hrmOrgUnitId: 'dept', locationType: 'STATE_OFFICE', stateId: 1, cityId: 7, isOfficeManager: true, employmentType: 'CONTRACT', reportingManagerEmployeeId: 'm1' },
    [{ code: 'BASIC', name: 'Basic salary', componentType: 'EARNING', monthlyAmount: 25000 }],
    'Asha',
  );
  assert.equal(restored.stateId, '1');
  assert.equal(restored.employmentType, 'CONTRACT');
  assert.equal(restored.reportingManagerName, 'Asha');
  assert.equal(restored.salaryComponents[0]!.monthlyAmount, '25000');
  const legacy = offerHrmFormFromStored(null, null);
  assert.equal(legacy.locationType, '');
  assert.equal(legacy.salaryComponents.length, 4);
});

test('a State Manager offer needs a manager only when several National Operations Managers exist', () => {
  const stateManager = { ...createEmptyOfferHrmForm(), hrmOrgUnitId: 'x', locationType: 'STATE_OFFICE' as const, stateId: '1', cityId: '5', isOfficeManager: true, salaryComponents: [] };
  assert.equal(validateOfferHrmForm(stateManager, 'State Manager', options).reportingManagerEmployeeId, undefined, 'old callers: no count');
  assert.equal(validateOfferHrmForm(stateManager, 'State Manager', options, 1).reportingManagerEmployeeId, undefined);
  assert.match(validateOfferHrmForm(stateManager, 'State Manager', options, 2).reportingManagerEmployeeId ?? '', /report to/);
  assert.equal(validateOfferHrmForm({ ...stateManager, reportingManagerEmployeeId: 'nom-1' }, 'State Manager', options, 2).reportingManagerEmployeeId, undefined);
  assert.equal(validateOfferHrmForm({ ...stateManager, isOfficeManager: false }, 'State Manager', options, 2).reportingManagerEmployeeId, undefined);
});
