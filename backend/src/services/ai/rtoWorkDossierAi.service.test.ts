import assert from 'node:assert/strict';
import test from 'node:test';
import { buildRtoWorkDossier, RtoWorkDossierError } from './rtoWorkDossierAi.service';

const date = (value: string) => new Date(value);
const decimal = (value: number) => ({ toNumber: () => value });

const record = (overrides: Record<string, unknown> = {}) => ({
  id: 'rto-1', listingId: 'listing-1', sellAccountId: null,
  customerName: 'Customer Name', customerNumber: '9999999999', vehicleNumber: 'CG04NX2753',
  brandName: 'JCB', vehicleType: 'Excavator', vehicleModel: '3DX', hirePurchaseStatus: 'PENDING', financerName: '',
  taxStatus: 'VALID', taxValidUntil: date('2027-01-01T00:00:00.000Z'),
  fitnessStatus: 'VALID', fitnessValidUntil: date('2027-01-01T00:00:00.000Z'),
  insuranceStatus: 'VALID', insuranceValidUntil: date('2027-01-01T00:00:00.000Z'),
  pucStatus: 'VALID', pucValidUntil: date('2027-01-01T00:00:00.000Z'),
  hsrpStatus: 'YES', hsrpNumber: 'HSRP-1', sellerName: 'Seller', sellerNumber: '8888888888',
  purchaserName: 'Purchaser', purchaserNumber: '7777777777', rtoOffice: 'Raipur RTO',
  rtoAgentName: 'Agent', rtoAgentState: 'CG', rtoAgentCity: 'Raipur', rtoAgentNumber: '6666666666',
  rtoExpenses: decimal(5000), rtoExpensesAdvance: decimal(2000), documentSendDate: null,
  rtoStatus: 'RTO_WORK_IN_PROGRESS', isLocked: false, lockedAt: null, lockedById: null,
  noteSheet: 'Follow up with agent', vehicleMaintenanceCost: decimal(1000), hourRunning: null,
  complianceSnapshot: { canTransfer: true, checks: [] }, complianceCheckedAt: date('2026-11-19T00:00:00.000Z'),
  createdAt: date('2026-11-18T00:00:00.000Z'), updatedAt: date('2026-11-19T00:00:00.000Z'),
  transferTasks: [{ id: 'task-1', taskKey: 'RC', label: 'RC Transfer', isOptional: false, sortOrder: 1, status: 'PENDING', remark: 'Need RC', documents: [{ id: 'doc-1', fileUrl: '/private/rc.pdf', fileName: 'rc.pdf', mimeType: 'application/pdf', size: 100, uploadedAt: date('2026-11-19T00:00:00.000Z') }], updatedById: null, createdAt: date('2026-11-18T00:00:00.000Z'), updatedAt: date('2026-11-19T00:00:00.000Z'), logs: [] }],
  statusLogs: [],
  listing: { id: 'listing-1', title: 'JCB 3DX', registrationNumberKey: 'CG04NX2753', chassisNumberKey: 'CHASSIS-1', engineNumber: 'ENGINE-1', manufacturingYear: 2022, operatingHours: 100, locationCity: 'Raipur', locationState: 'CG', status: 'SOLD', media: [], paymentSubmissions: [], partner: null, category: { name: 'Excavator' }, brand: { name: 'JCB' }, model: { name: '3DX' }, vehicleVerification: null },
  sellAccount: null,
  ...overrides,
});

const db = {
  vehicleRtoRecord: {
    findMany: async () => [record()],
  },
};

test('RTO dossier returns exact operational sections and hides stored file locators', async () => {
  const result = await buildRtoWorkDossier(db as never, { vehicleNumber: 'CG-04-NX-2753' }) as any;

  assert.equal(result.found, true);
  assert.equal(result.rto.vehicleNumber, 'CG04NX2753');
  assert.equal(result.rto.rtoExpensesBalance, 3000);
  assert.equal(result.tasks.items[0].label, 'RC Transfer');
  assert.equal(result.documents.items[0].fileName, 'rc.pdf');
  assert.equal(result.documents.items[0].fileUrl, undefined);
  assert.equal(result.listing.vehicle.chassisNumber, 'CHASSIS-1');
});

test('RTO dossier rejects missing identity and reports ambiguous matches without merging records', async () => {
  await assert.rejects(
    () => buildRtoWorkDossier(db as never, {}),
    (error: unknown) => error instanceof RtoWorkDossierError && error.code === 'IDENTIFIER_REQUIRED',
  );

  const ambiguousDb = { vehicleRtoRecord: { findMany: async () => [record(), record({ id: 'rto-2', rtoOffice: 'Durg RTO' })] } };
  const result = await buildRtoWorkDossier(ambiguousDb as never, { query: 'CG04NX2753' }) as any;
  assert.equal(result.found, false);
  assert.equal(result.dataAvailability, 'AMBIGUOUS');
  assert.equal(result.candidates.length, 2);
});
