import assert from 'node:assert/strict';
import test from 'node:test';
import { Prisma, RtoHsrpStatus, RtoHirePurchaseStatus, RtoValidityStatus } from '@prisma/client';
import { buildPayload, validateRtoPayload } from './rto.controller';

const validPayload = {
  customerName: 'Customer',
  customerNumber: '',
  vehicleNumber: 'CG04GO4234',
  vehicleType: 'Backhoe Loader',
  vehicleModel: 'JCB 3DX',
  hirePurchaseStatus: RtoHirePurchaseStatus.PENDING,
  taxStatus: RtoValidityStatus.LIFETIME,
  taxValidUntil: null,
  fitnessStatus: RtoValidityStatus.VALID,
  fitnessValidUntil: new Date('2027-02-10'),
  insuranceStatus: RtoValidityStatus.VALID,
  insuranceValidUntil: new Date('2027-03-10'),
  pucStatus: RtoValidityStatus.VALID,
  pucValidUntil: new Date('2027-04-10'),
  hsrpStatus: RtoHsrpStatus.YES,
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
  rtoStatus: 'PENDING',
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
