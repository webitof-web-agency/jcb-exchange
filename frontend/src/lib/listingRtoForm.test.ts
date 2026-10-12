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

const validWithoutProviderDates: ListingRtoFormState = {
  hirePurchaseStatus: 'NOT_APPLICABLE',
  taxStatus: 'NOT_AVAILABLE',
  taxValidUntil: '',
  fitnessStatus: 'NOT_AVAILABLE',
  fitnessValidUntil: '',
  insuranceStatus: 'NOT_AVAILABLE',
  pucStatus: 'NOT_AVAILABLE',
  pucValidUntil: '',
  hsrpStatus: 'PENDING',
  rtoOffice: 'FEROZPUR RTA, Punjab',
  rtoAgentName: 'Manual Agent',
  rtoExpenses: '100',
  vehicleMaintenanceCost: '100',
};

test('accepts unavailable provider validity dates without falsely requiring a date', () => {
  assert.equal(validateListingRtoForm(validWithoutProviderDates, base), null);
});

test('allows HSRP, RTO agent name, and RTO expenses to be omitted', () => {
  assert.equal(
    validateListingRtoForm({ ...validWithoutProviderDates, hsrpStatus: '' as ListingRtoFormState['hsrpStatus'], rtoAgentName: '', rtoExpenses: '' }, base),
    null,
  );
});

test('accepts and preserves the HSRP Not required option', () => {
  const form = { ...validWithoutProviderDates, hsrpStatus: 'NOT_APPLICABLE' as ListingRtoFormState['hsrpStatus'] };
  assert.equal(validateListingRtoForm(form, base), null);
  assert.equal(buildListingRtoDetails(form, base).hsrpStatus, 'NOT_APPLICABLE');
});

test('still requires a date when a validity status is manually marked valid', () => {
  assert.equal(
    validateListingRtoForm({ ...validWithoutProviderDates, fitnessStatus: 'VALID' }, base),
    'Fitness Validity status and date are required.',
  );
});

test('does not require expiry dates when validity status is expired', () => {
  assert.equal(
    validateListingRtoForm(
      {
        ...validWithoutProviderDates,
        taxStatus: 'EXPIRED',
        fitnessStatus: 'EXPIRED',
        insuranceStatus: 'EXPIRED',
        pucStatus: 'EXPIRED',
      },
      base,
    ),
    null,
  );
});

test('does not send stale dates for expired validity statuses', () => {
  const details = buildListingRtoDetails(
    {
      ...validWithoutProviderDates,
      taxStatus: 'EXPIRED',
      taxValidUntil: '2020-01-01',
      fitnessStatus: 'EXPIRED',
      fitnessValidUntil: '2020-01-01',
      insuranceStatus: 'EXPIRED',
      pucStatus: 'EXPIRED',
      pucValidUntil: '2020-01-01',
    },
    { ...base, insuranceExpiry: '2020-01-01' },
  );

  assert.equal(details.taxValidUntil, '');
  assert.equal(details.fitnessValidUntil, '');
  assert.equal(details.insuranceValidUntil, '');
  assert.equal(details.pucValidUntil, '');
});
