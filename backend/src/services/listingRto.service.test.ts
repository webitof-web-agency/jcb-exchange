import assert from 'node:assert/strict';
import test from 'node:test';
import { RtoHirePurchaseStatus, RtoHsrpStatus, RtoValidityStatus } from '@prisma/client';
import { buildListingRtoData, validateListingRtoDetails } from './listingRto.service';

const validInput = {
  registrationNo: 'CG04GO4234',
  vehicleType: 'Backhoe Loader',
  vehicleModel: 'JCB 3DX',
  operatingHours: '1200',
  hirePurchaseStatus: RtoHirePurchaseStatus.PENDING,
  taxStatus: RtoValidityStatus.VALID,
  taxValidUntil: '2027-01-10',
  fitnessStatus: RtoValidityStatus.VALID,
  fitnessValidUntil: '2027-02-10',
  insuranceStatus: RtoValidityStatus.VALID,
  insuranceValidUntil: '2027-03-10',
  pucStatus: RtoValidityStatus.VALID,
  pucValidUntil: '2027-04-10',
  hsrpStatus: RtoHsrpStatus.YES,
  rtoOffice: 'Raipur RTO',
  rtoAgentName: 'RTO Agent',
  rtoExpenses: '22344',
  vehicleMaintenanceCost: '18910',
};

test('buildListingRtoData maps listing fields without creating a second vehicle type field', () => {
  const result = buildListingRtoData(validInput, {
    ownerName: 'Partner One',
    ownerNumber: '9876543210',
    locationState: 'Chhattisgarh',
    locationCity: 'Raipur',
  });

  assert.equal(result.vehicleNumber, 'CG04GO4234');
  assert.equal(result.vehicleType, 'Backhoe Loader');
  assert.equal(result.vehicleModel, 'JCB 3DX');
  assert.equal(result.hourRunning, 1200);
  assert.equal(result.customerName, 'Partner One');
  assert.equal(result.rtoOffice, 'Raipur RTO');
  assert.equal(result.rtoExpenses.toString(), '22344');
});

test('validateListingRtoDetails uses the RTO required validity rules', () => {
  assert.equal(validateListingRtoDetails(validInput), null);
  assert.equal(
    validateListingRtoDetails({ ...validInput, taxValidUntil: '' }),
    'Tax Validity status and date are required.',
  );
  assert.equal(
    validateListingRtoDetails({ ...validInput, vehicleMaintenanceCost: '0' }),
    'Vehicle Maintenance Cost is required.',
  );
});
