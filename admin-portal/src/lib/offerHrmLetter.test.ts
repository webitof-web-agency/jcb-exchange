import assert from 'node:assert/strict';
import test from 'node:test';

import { addDaysToIsoDate, defaultOfferValidUntil, emptyOfferLetterData } from './offerLetter';
import {
  apiErrorMessage,
  buildOfferMultipart,
  createEmptyOfferHrmForm,
  describeClosedOffer,
  describeOfferStatusAction,
  formatLakhsPerYear,
  letterSalaryForPeriod,
  salaryBreakupForPdf,
  storedComponentsFrom,
  storedPlacementFromOffer,
} from './offerHrm';

test('offer validity date defaults to the letter date plus 7 days', () => {
  assert.equal(addDaysToIsoDate('2026-12-28', 7), '2027-01-04');
  assert.equal(addDaysToIsoDate('not a date', 7), '');
  assert.equal(defaultOfferValidUntil('2026-11-26'), '2026-12-03');
});

test('a stored offer row gives back its placement and breakup', () => {
  assert.equal(storedPlacementFromOffer({ hrmOrgUnitId: null }), null);
  assert.deepEqual(storedPlacementFromOffer({ hrmOrgUnitId: 'd', locationType: 'STATE_OFFICE', stateId: 3, cityId: 4, isOfficeManager: true }), {
    hrmOrgUnitId: 'd', locationType: 'STATE_OFFICE', stateId: 3, cityId: 4, isOfficeManager: true, employmentType: null, reportingManagerEmployeeId: null,
  });
  assert.deepEqual(storedComponentsFrom([{ code: 'BASIC', name: 'Basic', componentType: 'EARNING', monthlyAmount: '1000' }, { bad: true }, null]), [
    { code: 'BASIC', name: 'Basic', componentType: 'EARNING', monthlyAmount: 1000 },
  ]);
  assert.deepEqual(storedComponentsFrom('nope'), []);
});

test('the letter salary follows the breakup only when it has amounts', () => {
  const rows = [{ code: 'BASIC', name: 'Basic', componentType: 'EARNING' as const, monthlyAmount: '25000' }];
  assert.equal(letterSalaryForPeriod(rows, 'month'), '25000');
  assert.equal(letterSalaryForPeriod(rows, 'annum'), '300000');
  assert.equal(letterSalaryForPeriod([{ ...rows[0]!, monthlyAmount: '' }], 'month'), null);
  assert.deepEqual(salaryBreakupForPdf([...rows, { code: 'HRA', name: '', componentType: 'EARNING', monthlyAmount: '0' }]), [
    { name: 'Basic', componentType: 'EARNING', monthlyAmount: 25000 },
  ]);
  assert.equal(formatLakhsPerYear(357600), '₹3.58 L / yr');
  assert.equal(formatLakhsPerYear(0), '—');
});

test('the multipart body carries the letter, the validity date and the HRM fields', () => {
  const letter = { ...emptyOfferLetterData, designation: ' Sales Executive ', department: 'Sales', salaryAmount: '3,00,000', offerValidUntil: '2026-12-03', offerLetterNo: 'JCB/OFFER/2026/1' };
  const payload = buildOfferMultipart({ applicationId: 'app-1', letter, hrm: { ...createEmptyOfferHrmForm(), hrmOrgUnitId: 'dept', locationType: 'HEAD_OFFICE' }, pdfBlob: new Blob(['%PDF'], { type: 'application/pdf' }) });
  assert.equal(payload.get('applicationId'), 'app-1');
  assert.equal(payload.get('designation'), 'Sales Executive');
  assert.equal(payload.get('ctc'), '300000');
  assert.equal(payload.get('offerValidUntil'), '2026-12-03');
  assert.equal(payload.get('hrmOrgUnitId'), 'dept');
  assert.equal(payload.get('locationType'), 'HEAD_OFFICE');
  assert.equal(JSON.parse(String(payload.get('offerData'))).offerValidUntil, '2026-12-03');
  const file = payload.get('offerPdf');
  assert.ok(file instanceof Blob);
  assert.equal((file as File).name, 'JCB-OFFER-2026-1.pdf', 'slashes in the letter number do not end up in the file name');
});

test('messages: server errors, closed offers, status confirmations', () => {
  assert.equal(apiErrorMessage({ response: { data: { error: 'The letter says department X' } } }, 'fallback'), 'The letter says department X');
  assert.equal(apiErrorMessage(new Error('network'), 'fallback'), 'fallback');
  assert.match(describeClosedOffer('WITHDRAWN'), /withdrawn/);
  assert.match(describeClosedOffer('EXPIRED'), /expired/);
  assert.match(describeOfferStatusAction('ACCEPTED', 'Asha'), /HRM/);
  assert.match(describeOfferStatusAction('SENT', 'Asha'), /old link stops/);
});
