import assert from 'node:assert/strict';
import test from 'node:test';
import { AiReadOnlyToolsService, type AiReadOnlyToolDependencies, type AiToolContext } from './aiReadOnlyTools.service';
import { routeAiMessage } from './aiIntentRouter.service';
import { buildRtoWorkDossier, RtoWorkDossierError } from './rtoWorkDossierAi.service';
import { buildSoldVehicleOperatorAnswer } from './soldVehicleOperatorAnswer.service';
import { buildSoldVehicleDocumentActions } from './soldVehicleDocumentActions.service';

const dossier = {
  found: true,
  rto: { vehicleNumber: 'CG04NX2753', status: 'RTO_WORK_COMPLETED', office: 'Raipur RTO', isLocked: true, agent: { name: 'Agent One' }, expenses: { total: 5000, advance: 5000, balance: 0 } },
  vehicle: { registrationNumber: 'CG04NX2753', chassisNumber: 'CHASSIS-1', engineNumber: 'ENGINE-1', brand: 'JCB', model: '3DX' },
  parties: { customer: { name: 'Customer' }, seller: { name: 'Seller' }, purchaser: { name: 'Buyer' } },
  compliance: { tax: { status: 'VALID' }, fitness: { status: 'VALID' }, insurance: { status: 'VALID' }, puc: { status: 'VALID' }, hsrp: { status: 'YES' } },
  tasks: { total: 1, completed: 1, pending: 0, items: [{ label: 'RC Transfer', status: 'COMPLETED', documents: [] }] },
  documents: { total: 0, availableCount: 0, items: [] },
  soldVehicle: { recordNumber: 'SA-2026-001', invoiceNumber: 'INV-001', status: 'COMPLETED', paymentCount: 1, refundCount: 0 },
};

const dependencies = (result: unknown): AiReadOnlyToolDependencies => ({
  rtoWorkDetail: async () => result,
} as unknown as AiReadOnlyToolDependencies);

const execute = (context: AiToolContext) => new AiReadOnlyToolsService(dependencies(dossier)).execute(context, {
  name: 'rto.work.detail',
  arguments: { vehicleNumber: 'CG04NX2753' },
});

test('allows RTO dossier access for Super Admin, Admin, and permitted Employee only', async () => {
  const superAdmin = await execute({ userId: 'super', role: 'SUPER_ADMIN', permissions: [] });
  const admin = await execute({ userId: 'admin', role: 'ADMIN', permissions: [] });
  const employee = await execute({ userId: 'employee', role: 'EMPLOYEE', permissions: ['accounts.rto.read'] });

  for (const result of [superAdmin, admin, employee]) {
    assert.equal(result.contract.status, 'success');
    assert.equal(result.contract.permission, 'allowed');
  }
  await assert.rejects(
    () => execute({ userId: 'employee-2', role: 'EMPLOYEE', permissions: ['dashboard.view'] }),
    (error: unknown) => error instanceof Error && 'contract' in error
      && (error as { contract?: { status?: string } }).contract?.status === 'permission_denied',
  );
});

test('keeps blank, ambiguous, and data-source failures explicit', async () => {
  const record = { vehicleNumber: 'CG04NX2753', listing: null, sellAccount: null, transferTasks: [], statusLogs: [] };
  const db = { vehicleRtoRecord: { findMany: async () => [record] } };
  await assert.rejects(
    () => buildRtoWorkDossier(db as never, {}),
    (error: unknown) => error instanceof RtoWorkDossierError && error.code === 'IDENTIFIER_REQUIRED',
  );

  const ambiguous = { vehicleRtoRecord: { findMany: async () => [record, { ...record, vehicleNumber: 'CG04NX2754' }] } };
  const result = await buildRtoWorkDossier(ambiguous as never, { query: 'CG04NX' }) as { found: boolean; dataAvailability: string };
  assert.equal(result.found, false);
  assert.equal(result.dataAvailability, 'AMBIGUOUS');

  const failed = new AiReadOnlyToolsService({
    rtoWorkDetail: async () => { throw new Error('database password must not leak'); },
  } as unknown as AiReadOnlyToolDependencies);
  await assert.rejects(
    () => failed.execute({ userId: 'employee', role: 'EMPLOYEE', permissions: ['accounts.rto.read'] }, { name: 'rto.work.detail', arguments: { vehicleNumber: 'CG04NX2753' } }),
    (error: unknown) => error instanceof Error
      && error.message === 'The requested data is unavailable right now.'
      && !error.message.includes('password'),
  );
});

test('routes Hindi, Hinglish, English, and typo variants to the exact RTO dossier', () => {
  for (const message of [
    'RTO complete status CG04NX2753',
    'CG04NX2753 ka RTO status aur pending blockers batao',
    'CG04NX2753 की आरटीओ स्थिति और दस्तावेज बताओ',
    'CG04NX2753 ka RTO sttaus aur documnts btao',
  ]) {
    const route = routeAiMessage(message);
    assert.ok(route, message);
    assert.ok(['rto.work.detail', 'vehicle.documents.detail'].includes(route.name), message);
    assert.equal((route.arguments as { vehicleNumber?: string; query?: string }).vehicleNumber || (route.arguments as { vehicleNumber?: string; query?: string }).query, 'CG04NX2753', message);
  }
});

test('answers locked and completed RTO records with a human-readable next action', () => {
  const answer = buildSoldVehicleOperatorAnswer({ message: 'RTO ka complete status batao', toolName: 'rto.work.detail', operatorData: dossier });
  assert.match(answer || '', /RTO status/);
  assert.match(answer || '', /RTO_WORK_COMPLETED/);
  assert.match(answer || '', /Case locked: Yes/);
  assert.match(answer || '', /Next action/);
  assert.doesNotMatch(answer || '', /https?:\/\/|fileUrl|raw JSON/iu);
});

test('does not create document actions for unavailable sources and keeps generated actions secure', () => {
  const actions = buildSoldVehicleDocumentActions({
    dealId: '32e28d69-5b6e-41b8-a1dd-850528f6ad09',
    recordNumber: 'SA-2026-CANCELLED',
    vehicleNumber: 'CG04AB1234',
    invoiceNumber: null,
    creditNoteNumber: null,
    payments: [{ id: '42e28d69-5b6e-41b8-a1dd-850528f6ad09', side: 'PURCHASER_RECEIPT', receiptStatus: 'CANCELLED', receiptNumber: null }],
    refunds: [{ id: '52e28d69-5b6e-41b8-a1dd-850528f6ad09', refundNumber: null, status: 'REQUESTED' }],
    accountDocuments: [],
    rto: null,
    listingMedia: [],
    websitePayments: [],
  });
  assert.equal(actions.some((action) => action.url.includes('/payments/') || action.url.includes('/refunds/')), false);
  assert.equal(actions.some((action) => action.url.includes('/files/')), false);
  assert.ok(actions.every((action) => action.url.startsWith('/api/')));
  assert.ok(actions.some((action) => action.url.endsWith('/delivery-challan')));
  assert.ok(actions.some((action) => action.url.endsWith('/details.pdf?inline=1')));
  assert.ok(actions.some((action) => action.url.endsWith('/zip')));
});
