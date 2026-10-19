import assert from 'node:assert/strict';
import test from 'node:test';
import {
  Prisma,
  RtoHsrpStatus,
  RtoHirePurchaseStatus,
  RtoValidityStatus,
  RtoWorkStatus,
} from '@prisma/client';
import { buildPayload, validateRtoPayload } from './rto.controller';

const validPayload = {
  listingId: null,
  customerName: 'Customer',
  customerNumber: '',
  vehicleNumber: 'CG04GO4234',
  brandName: 'JCB',
  vehicleType: 'Backhoe Loader',
  vehicleModel: 'JCB 3DX',
  hirePurchaseStatus: RtoHirePurchaseStatus.PENDING,
  financerName: 'Finance Ltd',
  taxStatus: RtoValidityStatus.LIFETIME,
  taxValidUntil: null,
  fitnessStatus: RtoValidityStatus.VALID,
  fitnessValidUntil: new Date('2027-02-10'),
  insuranceStatus: RtoValidityStatus.VALID,
  insuranceValidUntil: new Date('2027-03-10'),
  pucStatus: RtoValidityStatus.VALID,
  pucValidUntil: new Date('2027-04-10'),
  hsrpStatus: RtoHsrpStatus.YES,
  hsrpNumber: 'HSRP-12345',
  sellerName: 'Seller',
  sellerNumber: '',
  purchaserName: 'Purchaser',
  purchaserNumber: '',
  rtoOffice: 'Raipur RTO',
  rtoAgentName: 'Agent',
  rtoAgentState: 'Chhattisgarh',
  rtoAgentCity: 'Raipur',
  rtoAgentNumber: '',
  rtoExpenses: new Prisma.Decimal(100),
  rtoExpensesAdvance: new Prisma.Decimal(0),
  documentSendDate: null,
  rtoStatus: RtoWorkStatus.PENDING,
  noteSheet: null,
  vehicleMaintenanceCost: new Prisma.Decimal(100),
  hourRunning: null,
};

test('allows RTO records without the removed Hours Running field', () => {
  assert.equal(validateRtoPayload(validPayload), null);
});

test('allows zero financial values when the form has no expense inputs', () => {
  assert.equal(
    validateRtoPayload({
      ...validPayload,
      rtoExpenses: new Prisma.Decimal(0),
      rtoExpensesAdvance: new Prisma.Decimal(0),
      vehicleMaintenanceCost: new Prisma.Decimal(0),
    }),
    null,
  );
});

test('trims and persists remarks for create and edit payloads', () => {
  const created = buildPayload({ ...validPayload, noteSheet: '  Documents verified\nFollow up on RC.  ' });
  assert.equal(created.noteSheet, 'Documents verified\nFollow up on RC.');

  const existing = { ...validPayload, noteSheet: 'Existing remark' };
  assert.equal(buildPayload({}, existing).noteSheet, 'Existing remark');
  assert.equal(buildPayload({ noteSheet: '   ' }, existing).noteSheet, null);
});

test('trims and persists the selected brand', () => {
  const payload = buildPayload({ ...validPayload, brandName: '  CAT  ' });

  assert.equal(payload.brandName, 'CAT');
});

test('preserves an optional listing link when creating an RTO payload', () => {
  const payload = buildPayload({ ...validPayload, listingId: 'listing-1' });

  assert.equal(payload.listingId, 'listing-1');
});

test('requires a brand for RTO records', () => {
  assert.equal(
    validateRtoPayload({ ...validPayload, brandName: '' }),
    'Brand is required.',
  );
});

test('allows RTO records without RTO Agent Name, State, City, or Expenses', () => {
  assert.equal(
    validateRtoPayload({
      ...validPayload,
      rtoAgentName: '',
      rtoAgentState: '',
      rtoAgentCity: '',
      rtoExpenses: new Prisma.Decimal(0),
    }),
    null,
  );
});

test('does not require validity date when status is EXPIRED', () => {
  assert.equal(
    validateRtoPayload({
      ...validPayload,
      taxStatus: RtoValidityStatus.EXPIRED,
      taxValidUntil: null,
      fitnessStatus: RtoValidityStatus.EXPIRED,
      fitnessValidUntil: null,
      insuranceStatus: RtoValidityStatus.EXPIRED,
      insuranceValidUntil: null,
      pucStatus: RtoValidityStatus.EXPIRED,
      pucValidUntil: null,
    }),
    null,
  );
});

test('requires validity date only when status is VALID', () => {
  assert.equal(
    validateRtoPayload({
      ...validPayload,
      fitnessStatus: RtoValidityStatus.VALID,
      fitnessValidUntil: null,
    }),
    'Fitness Validity date is required when marked as Valid.',
  );
});

test('clears validity dates in buildPayload when status is EXPIRED', () => {
  const payload = buildPayload({
    ...validPayload,
    taxStatus: RtoValidityStatus.EXPIRED,
    taxValidUntil: '2027-01-01',
    fitnessStatus: RtoValidityStatus.EXPIRED,
    fitnessValidUntil: '2027-01-01',
  });
  assert.equal(payload.taxValidUntil, null);
  assert.equal(payload.fitnessValidUntil, null);
});

test('allows RTO records without hsrpStatus', () => {
  const payload = buildPayload({
    ...validPayload,
    hsrpStatus: '',
  });
  assert.equal(validateRtoPayload(payload), null);
});

test('maps NOT_REQUIRED to NOT_APPLICABLE for hsrpStatus', () => {
  const payload = buildPayload({
    ...validPayload,
    hsrpStatus: 'NOT_REQUIRED',
  });
  assert.equal(payload.hsrpStatus, RtoHsrpStatus.NOT_APPLICABLE);
});
