import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildListingRtoDetails,
  validateListingRtoForm,
  type ListingRtoFormState,
} from './listingRtoForm';

const base = {
  registrationNo: 'PB00AZ1234',
  vehicleType: 'Motor Car(LMV)',
  vehicleModel: 'I20 SPORTZ CRDI',
  operatingHours: '1200',
  insuranceExpiry: '',
};

const expiredForm: ListingRtoFormState = {
  hirePurchaseStatus: 'NOT_APPLICABLE',
  taxStatus: 'EXPIRED',
  taxValidUntil: '',
  fitnessStatus: 'EXPIRED',
  fitnessValidUntil: '',
  insuranceStatus: 'EXPIRED',
  pucStatus: 'EXPIRED',
  pucValidUntil: '',
  hsrpStatus: 'PENDING',
  rtoOffice: 'FEROZPUR RTA, Punjab',
  rtoAgentName: 'Manual Agent',
  rtoExpenses: '100',
  vehicleMaintenanceCost: '100',
};

test('admin Sell Vehicle accepts expired compliance statuses without dates', () => {
  assert.equal(validateListingRtoForm(expiredForm, base), null);
});

test('admin Sell Vehicle allows HSRP, RTO agent name, and RTO expenses to be omitted', () => {
  assert.equal(
    validateListingRtoForm({ ...expiredForm, hsrpStatus: '' as ListingRtoFormState['hsrpStatus'], rtoAgentName: '', rtoExpenses: '' }, base),
    null,
  );
});

test('admin Sell Vehicle accepts and preserves the HSRP Not required option', () => {
  const form = { ...expiredForm, hsrpStatus: 'NOT_APPLICABLE' as ListingRtoFormState['hsrpStatus'] };
  assert.equal(validateListingRtoForm(form, base), null);
  assert.equal(buildListingRtoDetails(form, base).hsrpStatus, 'NOT_APPLICABLE');
});

test('admin Sell Vehicle removes stale expired dates from the API payload', () => {
  const details = buildListingRtoDetails(
    {
      ...expiredForm,
      taxValidUntil: '2020-01-01',
      fitnessValidUntil: '2020-01-01',
      pucValidUntil: '2020-01-01',
    },
    { ...base, insuranceExpiry: '2020-01-01' },
  );

  assert.equal(details.taxValidUntil, '');
  assert.equal(details.fitnessValidUntil, '');
  assert.equal(details.insuranceValidUntil, '');
  assert.equal(details.pucValidUntil, '');
});
