import test from 'node:test';
import assert from 'node:assert/strict';
import {
  annualCtcFrom,
  canChangeOfferStatus,
  canDeleteOffer,
  canEditOffer,
  describeOfferStatusChangeBlock,
  isOfferStatus,
  normalizeSalaryComponents,
  totalSalaryComponents,
} from './offerRules';

test('offer status moves follow the HR rules', () => {
  assert.equal(canChangeOfferStatus('SENT', 'ACCEPTED'), true);
  assert.equal(canChangeOfferStatus('SENT', 'SENT'), true, 'resend');
  assert.equal(canChangeOfferStatus('SENT', 'EXPIRED'), true, 'HR expires by hand');
  assert.equal(canChangeOfferStatus('SENT', 'WITHDRAWN'), true);
  assert.equal(canChangeOfferStatus('DECLINED', 'SENT'), true, 're-offer');
  assert.equal(canChangeOfferStatus('EXPIRED', 'SENT'), true, 're-offer');
  assert.equal(canChangeOfferStatus('ACCEPTED', 'SENT'), false, 'accepted is final');
  assert.equal(canChangeOfferStatus('ACCEPTED', 'WITHDRAWN'), false);
  assert.equal(canChangeOfferStatus('WITHDRAWN', 'SENT'), false);
  assert.equal(canChangeOfferStatus('DECLINED', 'ACCEPTED'), false);
  assert.match(describeOfferStatusChangeBlock('ACCEPTED', 'SENT') ?? '', /HRM/);
  assert.equal(describeOfferStatusChangeBlock('SENT', 'DECLINED'), null);
  assert.equal(isOfferStatus('WITHDRAWN'), true);
  assert.equal(isOfferStatus('REVOKED'), false);
});

test('accepted and withdrawn offers are records: no edit; an accepted offer is never deleted', () => {
  assert.equal(canEditOffer('SENT'), true);
  assert.equal(canEditOffer('DECLINED'), true);
  assert.equal(canEditOffer('ACCEPTED'), false);
  assert.equal(canEditOffer('WITHDRAWN'), false);
  assert.equal(canDeleteOffer('ACCEPTED'), false);
  assert.equal(canDeleteOffer('WITHDRAWN'), true);
});

test('salary breakup is cleaned, checked and totalled', () => {
  const parsed = normalizeSalaryComponents(JSON.stringify([
    { code: 'basic', name: ' Basic  salary ', componentType: 'EARNING', monthlyAmount: '20,000' },
    { code: 'HRA', name: 'House rent allowance', componentType: 'EARNING', monthlyAmount: 8000 },
    { code: 'PF_EMPLOYER', name: 'Employer PF', componentType: 'EMPLOYER_CONTRIBUTION', monthlyAmount: 1800 },
    { code: 'SPECIAL', name: 'Special allowance', componentType: 'EARNING', monthlyAmount: 0 },
  ]));
  assert.ok('components' in parsed);
  if (!('components' in parsed)) return;
  assert.deepEqual(parsed.components.map((c) => c.code), ['BASIC', 'HRA', 'PF_EMPLOYER'], 'zero rows dropped, codes upper-cased');
  assert.equal(parsed.components[0]!.name, 'Basic salary');
  assert.deepEqual(totalSalaryComponents(parsed.components), { grossMonthly: 28000, ctcMonthly: 29800, annualCtc: 357600 });

  assert.deepEqual(normalizeSalaryComponents(undefined), { components: [] });
  assert.ok('error' in normalizeSalaryComponents('not json'));
  assert.ok('error' in normalizeSalaryComponents([{ code: 'BASIC', name: 'Basic', componentType: 'EARNING', monthlyAmount: -1 }]));
  assert.ok('error' in normalizeSalaryComponents([{ code: 'BASIC', name: 'Basic', componentType: 'BONUS', monthlyAmount: 1 }]));
  assert.ok('error' in normalizeSalaryComponents([
    { code: 'BASIC', name: 'Basic', componentType: 'EARNING', monthlyAmount: 1 },
    { code: 'basic', name: 'Basic again', componentType: 'EARNING', monthlyAmount: 1 },
  ]), 'duplicate code');
  assert.ok('error' in normalizeSalaryComponents([{ code: 'PF_EMPLOYER', name: 'PF', componentType: 'EMPLOYER_CONTRIBUTION', monthlyAmount: 100 }]), 'needs an earning');
});

test('yearly CTC from the letter amount and period', () => {
  assert.equal(annualCtcFrom(30000, 'month'), 360000);
  assert.equal(annualCtcFrom(360000, 'annum'), 360000);
  assert.equal(annualCtcFrom(360000, undefined), 360000);
});
