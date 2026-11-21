import test from 'node:test';
import assert from 'node:assert/strict';
import { routeAiMessage } from './aiIntentRouter.service';
import { buildVehicleDocsOperatorAnswer } from './vehicleDocsOperatorAnswer.service';
import { AiReadOnlyToolsService, type AiToolContext } from './aiReadOnlyTools.service';

test('vehicle docs router routes general queries to vehicle.documents.summary with real-time current scope (no 30-day limit)', () => {
  const q1 = routeAiMessage('vehicle docs ka summary batao');
  assert.equal(q1?.name, 'vehicle.documents.summary');
  assert.deepEqual(q1?.arguments, {});

  const q2 = routeAiMessage('vehicle docs module me kya chal raha hai');
  assert.equal(q2?.name, 'vehicle.documents.summary');
  assert.deepEqual(q2?.arguments, {});

  const q3 = routeAiMessage('saare vehicle documents ka live status dikhao');
  assert.equal(q3?.name, 'vehicle.documents.summary');
  assert.deepEqual(q3?.arguments, {});

  const q4 = routeAiMessage('kitne vehicle docs hain platform par');
  assert.equal(q4?.name, 'vehicle.documents.summary');
  assert.deepEqual(q4?.arguments, {});

  const q5 = routeAiMessage('vehicle docs moduel me kitne data haibtao mujhe?');
  assert.equal(q5?.name, 'vehicle.documents.summary');
  assert.deepEqual(q5?.arguments, {});
});

test('vehicle docs router respects vehicle-docs page context without imposing 30-day bounds', () => {
  const listContext = { groupKey: 'accounts', moduleKey: 'vehicle-docs', moduleLabel: 'Vehicle Docs' };
  const res1 = routeAiMessage('kya status hai yahan par', listContext);
  assert.equal(res1?.name, 'vehicle.documents.summary');
  assert.deepEqual(res1?.arguments, {});

  const detailContext = { groupKey: 'accounts', moduleKey: 'vehicle-docs', moduleLabel: 'Vehicle Docs CG11BN7867', recordId: 'CG11BN7867' };
  const res2 = routeAiMessage('saare kagaz dikhao', detailContext);
  assert.equal(res2?.name, 'vehicle.documents.detail');
  assert.equal(res2?.arguments.query, 'CG11BN7867');
});

test('vehicle.documents.summary tool returns live current state without 30-day periodDays restriction', async () => {
  const mockVehicles = [
    {
      vehicleNumber: 'CG11BN7867',
      title: '2021 JCB 3DX Backhoe Loader',
      owner: 'Ramesh Patel',
      buyer: 'Suresh Kumar',
      chassisNumber: 'HAR3DX2021B09876',
      engineNumber: '4H2021E9876',
      dealStatus: 'DEAL_DONE',
      rtoStatus: 'RTO_WORK_IN_PROGRESS',
      listingStatus: 'SOLD',
      documentsCount: 14,
      detailsPdfUrl: '/api/vehicle-docs/CG11BN7867/details.pdf?inline=1',
      allDocsZipUrl: '/api/vehicle-docs/CG11BN7867/zip',
      updatedAt: '2026-11-20T10:00:00.000Z',
    },
    {
      vehicleNumber: 'CG04NF0268',
      title: '2022 Caterpillar 424B Backhoe Loader',
      owner: 'Amit Sharma',
      buyer: 'Vikram Singh',
      chassisNumber: 'CAT424B2022C12345',
      engineNumber: 'C424E12345',
      dealStatus: 'TOKEN_RECEIVED',
      rtoStatus: 'DOCUMENT_COLLECTED',
      listingStatus: 'SOLD',
      documentsCount: 9,
      detailsPdfUrl: '/api/vehicle-docs/CG04NF0268/details.pdf?inline=1',
      allDocsZipUrl: '/api/vehicle-docs/CG04NF0268/zip',
      updatedAt: '2026-11-19T10:00:00.000Z',
    },
  ];

  const service = new AiReadOnlyToolsService({
    vehicleDocumentsSummary: async (_ctx: AiToolContext, _args: Record<string, never>) => ({
      found: true,
      scope: 'CURRENT_REALTIME_INVENTORY',
      isRealtimeCurrentState: true,
      periodDays: null,
      totalVehicles: mockVehicles.length,
      totalDocuments: 23,
      dealStatusBreakdown: { DEAL_DONE: 1, TOKEN_RECEIVED: 1 },
      rtoStatusBreakdown: { RTO_WORK_IN_PROGRESS: 1, DOCUMENT_COLLECTED: 1 },
      listingStatusBreakdown: { SOLD: 2 },
      returnedCount: mockVehicles.length,
      vehicles: mockVehicles,
      maskedFields: [],
    }),
  } as any);

  const result = await service.execute({
    userId: 'emp-1',
    role: 'EMPLOYEE',
    permissions: ['accounts.sell.read'],
  }, { name: 'vehicle.documents.summary', arguments: {} });

  const payload = (result as any).operatorData ?? (result as any).data;
  assert.equal(payload.scope, 'CURRENT_REALTIME_INVENTORY');
  assert.equal(payload.isRealtimeCurrentState, true);
  assert.equal(payload.periodDays, null);
  assert.equal(payload.totalVehicles, 2);
  assert.equal(payload.totalDocuments, 23);
  assert.equal(payload.vehicles.length, 2);
  assert.equal(payload.vehicles[0].vehicleNumber, 'CG11BN7867');
  assert.equal(payload.vehicles[0].documentsCount, 14);
});

test('buildVehicleDocsOperatorAnswer renders real-time current vehicle docs summary in ChatGPT style', () => {
  const operatorData = {
    found: true,
    scope: 'CURRENT_REALTIME_INVENTORY',
    isRealtimeCurrentState: true,
    periodDays: null,
    totalVehicles: 2,
    totalDocuments: 23,
    dealStatusBreakdown: { DEAL_DONE: 1, TOKEN_RECEIVED: 1 },
    rtoStatusBreakdown: { RTO_WORK_IN_PROGRESS: 1, DOCUMENT_COLLECTED: 1 },
    vehicles: [
      {
        vehicleNumber: 'CG11BN7867',
        title: '2021 JCB 3DX Backhoe Loader',
        owner: 'Ramesh Patel',
        buyer: 'Suresh Kumar',
        dealStatus: 'DEAL_DONE',
        rtoStatus: 'RTO_WORK_IN_PROGRESS',
        documentsCount: 14,
        detailsPdfUrl: '/api/vehicle-docs/CG11BN7867/details.pdf?inline=1',
        allDocsZipUrl: '/api/vehicle-docs/CG11BN7867/zip',
      },
      {
        vehicleNumber: 'CG04NF0268',
        title: '2022 Caterpillar 424B',
        owner: 'Amit Sharma',
        buyer: 'Vikram Singh',
        dealStatus: 'TOKEN_RECEIVED',
        rtoStatus: 'DOCUMENT_COLLECTED',
        documentsCount: 9,
        detailsPdfUrl: '/api/vehicle-docs/CG04NF0268/details.pdf?inline=1',
        allDocsZipUrl: '/api/vehicle-docs/CG04NF0268/zip',
      },
    ],
  };

  const response = buildVehicleDocsOperatorAnswer({
    message: 'vehicle docs ka current summary batao',
    toolName: 'vehicle.documents.summary',
    operatorData,
  });

  assert.ok(response);
  assert.match(response, /### 📁 Vehicle Docs Module — Real-Time Current Status/);
  assert.match(response, /Live Real-Time Data/);
  assert.match(response, /Total Vehicle Dossiers in Platform:\*\* \*\*2 Vehicles\*\*/);
  assert.match(response, /Total Uploaded Documents & Proofs:\*\* \*\*23 Files\*\*/);
  assert.match(response, /CG11BN7867/);
  assert.match(response, /Ramesh Patel/);
  assert.match(response, /Suresh Kumar/);
  assert.match(response, /\[📄 Details PDF\]\(\/api\/vehicle-docs\/CG11BN7867\/details\.pdf\?inline=1\)/);
  assert.match(response, /\[📦 All Docs ZIP\]\(\/api\/vehicle-docs\/CG11BN7867\/zip\)/);
  assert.doesNotMatch(response, /\[REDACTED\]/);
});
