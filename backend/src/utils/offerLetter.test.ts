import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeOfferLetterData, validateOfferLetterData } from './offerLetter';

test('normalizes offer letter fields and preserves the full document data shape', () => {
  const result = normalizeOfferLetterData({
    employeeName: '  Priya Sharma ',
    employeeAddress: '  Jaipur, Rajasthan ',
    companyName: ' JCB Exchange ',
    designation: 'Heavy Machine Operator',
    department: 'Operations',
    placeOfPosting: 'New Delhi',
    salaryAmount: ' 45000 ',
    salaryPeriod: 'month',
    joiningDate: '2026-10-15',
    probationPeriod: '6',
    noticePeriod: '30',
    letterDate: '2026-09-29',
    offerLetterNo: 'JCB/OFFER/001',
    signatoryName: 'Arjun Kumar Gupta',
    signatoryDesignation: 'HR Manager',
    signatoryDate: '2026-09-29',
    signatoryPlace: 'New Delhi',
    acceptanceDate: '',
    acceptancePlace: '',
    additionalTerms: '  Additional approved term. ',
  });

  assert.equal(result.employeeName, 'Priya Sharma');
  assert.equal(result.salaryAmount, '45000');
  assert.equal(result.additionalTerms, 'Additional approved term.');
  assert.equal(result.acceptanceDate, '');
  assert.equal(result.acceptancePlace, '');
});

test('reports missing required offer letter fields', () => {
  const errors = validateOfferLetterData(normalizeOfferLetterData({}));

  assert.ok(errors.includes('Employee name is required.'));
  assert.ok(errors.includes('Designation is required.'));
  assert.ok(errors.includes('Joining date is required.'));
  assert.ok(errors.includes('Authorized signatory name is required.'));
});
