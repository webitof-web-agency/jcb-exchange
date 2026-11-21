import test from 'node:test';
import assert from 'node:assert/strict';
import { routeAiMessage } from './aiIntentRouter.service';
import { AiReadOnlyToolsService, type AiToolContext } from './aiReadOnlyTools.service';
import { buildTasksOperatorAnswer } from './tasksOperatorAnswer.service';

const operatorContext: AiToolContext = {
  userId: 'emp-1',
  role: 'EMPLOYEE',
  permissions: ['tasks.read', 'accounts.rto.read', 'accounts.rto.crud', 'accounts.sell.read'],
};

test('tasks router routes pageContext on /employee/tasks properly', () => {
  const pageContext = { groupKey: 'operations', moduleKey: 'tasks', moduleLabel: 'RTO Transfer & Compliance Tasks' };

  // General desk query on tasks page
  const routedOverview = routeAiMessage('yahan kitne tasks chal rahe hain?', pageContext);
  assert.equal(routedOverview?.name, 'tasks.compliance.overview');
  assert.deepEqual(routedOverview?.arguments, {});

  // Vehicle specific query on tasks page
  const routedDetail = routeAiMessage('CG 11 BN 7867 ke saare tasks dikhao', pageContext);
  assert.equal(routedDetail?.name, 'tasks.compliance.detail');
  assert.ok(routedDetail?.arguments?.query);
});

test('tasks router routes natural language questions without pageContext', () => {
  const q1 = routeAiMessage('tasks module me total kitne milestones hain?');
  assert.equal(q1?.name, 'tasks.compliance.overview');

  const q2 = routeAiMessage('CG 11 BN 7867 ke RTO transfer tasks ka complete status batao');
  assert.equal(q2?.name, 'tasks.compliance.detail');

  const q3 = routeAiMessage('Satish Kumar Banjare ke compliance tasks dikhao');
  assert.equal(q3?.name, 'tasks.compliance.detail');

  const q4 = routeAiMessage('RTO compliance tasks desk par kya live status hai?');
  assert.equal(q4?.name, 'tasks.compliance.overview');

  const q5 = routeAiMessage('tasks desk par DSA remark kya hai?');
  assert.equal(q5?.name, 'tasks.compliance.overview');

  const q6 = routeAiMessage('Fitness Certificate aur Road Tax ka kya status hai CG 11 BN 7867');
  assert.equal(q6?.name, 'tasks.compliance.detail');

  const q7 = routeAiMessage('Deal #SA-2026-001 ke compliance tasks');
  assert.equal(q7?.name, 'tasks.compliance.detail');
});

test('tasks.compliance.overview returns 100% real-time data without 30-day limits', async () => {
  const mockVehicles = [
    {
      vehicleNumber: 'CG 11 BN 7867',
      title: 'JCB INDIA LIMITED 3DX',
      customerName: 'SATISH KUMAR BANJARE',
      dealNumber: '#SA-2026-001',
      rtoOffice: 'JANJGIR CHAMPA',
      rtoStatus: 'DEAL_DONE',
      milestonesDone: 7,
      milestonesTotal: 7,
      pendingCount: 0,
      inProcessingCount: 0,
      blockersCount: 0,
      completionPercentage: 100,
      pendingLabels: [],
    },
  ];

  const service = new AiReadOnlyToolsService({
    tasksComplianceOverview: async () => ({
      found: true,
      scope: 'CURRENT_REALTIME_OPERATIONS',
      isRealtimeCurrentState: true,
      periodDays: null,
      totalVehicles: 1,
      totalMilestones: 7,
      pendingAction: 0,
      inProcessing: 0,
      issuesReported: 0,
      transferredOrDone: 7,
      completionPercentage: 100,
      mandatoryCount: 5,
      optionalCount: 2,
      returnedCount: 1,
      vehicles: mockVehicles,
      maskedFields: [],
    }),
  } as any, {
    recordExecution: async () => undefined,
  });

  const rawResult = await service.execute(operatorContext, {
    name: 'tasks.compliance.overview',
    arguments: {},
  });

  const payload: any = (rawResult as any).operatorData ?? (rawResult as any).data;
  assert.equal(payload.scope, 'CURRENT_REALTIME_OPERATIONS');
  assert.equal(payload.isRealtimeCurrentState, true);
  assert.equal(payload.periodDays, null);
  assert.equal(payload.totalMilestones, 7);
  assert.equal(payload.totalVehicles, 1);
  assert.equal(payload.completionPercentage, 100);
  assert.ok(Array.isArray(payload.vehicles));
  assert.equal(payload.vehicles[0].vehicleNumber, 'CG 11 BN 7867');
});

test('tasks.compliance.detail returns 360-degree unmasked case data with 7 milestones and remarks', async () => {
  const mockDetail = {
    found: true,
    scope: 'CURRENT_REALTIME_OPERATIONS',
    isRealtimeCurrentState: true,
    periodDays: null,
    vehicleNumber: 'CG 11 BN 7867',
    title: 'JCB INDIA LIMITED 3DX',
    brandName: 'JCB',
    vehicleModel: '3DX',
    vehicleType: 'BACKHOE LOADER',
    chassisNumber: 'HAR3DX00XXXXXXXX',
    engineNumber: '4HXXXXXXXX',
    completionPercentage: 100,
    milestonesDone: 7,
    milestonesTotal: 7,
    milestones: [
      { id: 't-1', taskKey: 'RC', label: 'RC Transfer', isOptional: false, sortOrder: 1, status: 'TRANSFERRED', remark: 'Transferred', documents: [], updatedAt: new Date().toISOString() },
      { id: 't-2', taskKey: 'INSURANCE', label: 'Insurance Transfer', isOptional: false, sortOrder: 2, status: 'TRANSFERRED', remark: 'Transferred', documents: [], updatedAt: new Date().toISOString() },
      { id: 't-3', taskKey: 'NOC', label: 'NOC / Clearance', isOptional: false, sortOrder: 3, status: 'TRANSFERRED', remark: 'NOC done', documents: [], updatedAt: new Date().toISOString() },
      { id: 't-4', taskKey: 'PUC', label: 'PUC Certificate', isOptional: false, sortOrder: 4, status: 'TRANSFERRED', remark: 'Valid', documents: [], updatedAt: new Date().toISOString() },
      { id: 't-5', taskKey: 'HSRP', label: 'HSRP Plate', isOptional: true, sortOrder: 5, status: 'TRANSFERRED', remark: 'Fitted', documents: [], updatedAt: new Date().toISOString() },
      { id: 't-6', taskKey: 'TAX', label: 'Road Tax', isOptional: false, sortOrder: 6, status: 'NOT_REQUIRED', remark: 'BECAUSE DSA IS WORKING ON CLEARANCE', documents: [], updatedAt: new Date().toISOString() },
      { id: 't-7', taskKey: 'FITNESS', label: 'Fitness Certificate', isOptional: true, sortOrder: 7, status: 'NOT_REQUIRED', remark: 'BECAUSE DSA IS WORKING ON CLEARANCE', documents: [], updatedAt: new Date().toISOString() },
    ],
    parties: {
      customer: { name: 'SATISH KUMAR BANJARE', number: '9826100000', city: 'Janjgir', state: 'Chhattisgarh' },
      seller: { name: 'RAMESHWAR SAHU', number: '9425200000', city: 'Bilaspur', state: 'Chhattisgarh' },
    },
    deal: {
      recordNumber: '#SA-2026-001',
      dealStatus: 'DEAL_DONE',
      purchaseAmount: 1600000,
      sellAmount: 1850000,
      received: 1850000,
      paidToSeller: 1600000,
      invoiceNumber: 'INV-2026-001',
    },
    rto: {
      id: 'rto-1',
      office: 'JANJGIR CHAMPA',
      masterStatus: 'DEAL_DONE',
      agent: { name: 'SURESH AGENT', number: '9755500000', city: 'Janjgir, CG' },
      expenses: { total: 12000, advance: 10000, balance: 2000 },
      isLocked: true,
    },
    rtoCertificateUrl: '/api/recruitment/admin/rto-records/rto-1/transfer-certificate',
    maskedFields: [],
  };

  const service = new AiReadOnlyToolsService({
    tasksComplianceDetail: async () => mockDetail,
  } as any, {
    recordExecution: async () => undefined,
  });

  const rawResult = await service.execute(operatorContext, {
    name: 'tasks.compliance.detail',
    arguments: { query: 'CG 11 BN 7867' },
  });

  const payload: any = (rawResult as any).operatorData ?? (rawResult as any).data;
  assert.equal(payload.found, true);
  assert.equal(payload.scope, 'CURRENT_REALTIME_OPERATIONS');
  assert.equal(payload.periodDays, null);
  assert.ok(payload.vehicleNumber.includes('CG 11 BN 7867'));
  assert.ok(Array.isArray(payload.milestones));
  assert.equal(payload.milestones.length, 7, 'Must have all 7 milestones');

  // Verify staff remarks are present (DSA remark)
  const remarks = payload.milestones.map((m: any) => m.remark).filter(Boolean);
  assert.ok(remarks.length > 0, 'Staff remarks must be included');
  assert.match(remarks.join(' '), /BECAUSE DSA IS WORKING/);

  // Verify parties and deal are connected
  assert.equal(payload.parties?.customer?.name, 'SATISH KUMAR BANJARE');
  assert.equal(payload.deal?.recordNumber, '#SA-2026-001');
  assert.equal(payload.rto?.office, 'JANJGIR CHAMPA');
});

test('buildTasksOperatorAnswer produces rich ChatGPT-style response with zero masking', () => {
  const sampleOverview = {
    totalVehicles: 1,
    totalMilestones: 7,
    pendingAction: 0,
    inProcessing: 0,
    issuesReported: 0,
    transferredOrDone: 7,
    completionPercentage: 100,
    mandatoryCount: 5,
    optionalCount: 2,
    vehicles: [
      {
        vehicleNumber: 'CG 11 BN 7867',
        title: 'JCB INDIA LIMITED 3DX',
        customerName: 'SATISH KUMAR BANJARE',
        dealNumber: '#SA-2026-001',
        rtoOffice: 'JANJGIR CHAMPA',
        rtoStatus: 'DEAL_DONE',
        milestonesDone: 7,
        milestonesTotal: 7,
        completionPercentage: 100,
        blockersCount: 0,
      },
    ],
  };

  const overviewAnswer = buildTasksOperatorAnswer({
    message: 'tasks desk par kya chal raha hai?',
    toolName: 'tasks.compliance.overview',
    operatorData: sampleOverview,
  });

  assert.ok(overviewAnswer);
  assert.match(overviewAnswer, /RTO Transfer & Compliance Tasks Desk/);
  assert.match(overviewAnswer, /7 Milestones/);
  assert.match(overviewAnswer, /100%/);
  assert.match(overviewAnswer, /SATISH KUMAR BANJARE/);
  assert.match(overviewAnswer, /#SA-2026-001/);
  assert.doesNotMatch(overviewAnswer, /\[REDACTED/);

  const sampleDetail = {
    found: true,
    vehicleNumber: 'CG 11 BN 7867',
    title: 'JCB INDIA LIMITED 3DX',
    chassisNumber: 'HAR3DX00XXXXXXXX',
    completionPercentage: 100,
    milestonesDone: 7,
    milestonesTotal: 7,
    parties: {
      customer: { name: 'SATISH KUMAR BANJARE', number: '9826100000', city: 'Janjgir' },
      seller: { name: 'RAMESHWAR SAHU', number: '9425200000' },
    },
    deal: {
      recordNumber: '#SA-2026-001',
      dealStatus: 'DEAL_DONE',
      sellAmount: 1850000,
      purchaseAmount: 1600000,
      received: 1850000,
      paidToSeller: 1600000,
      invoiceNumber: 'INV-2026-001',
    },
    rto: {
      office: 'JANJGIR CHAMPA',
      masterStatus: 'DEAL_DONE',
      agent: { name: 'SURESH AGENT', number: '9755500000', city: 'Janjgir' },
      expenses: { total: 12000, advance: 10000, balance: 2000 },
      isLocked: true,
    },
    milestones: [
      { taskKey: 'RC', label: 'RC Transfer', isOptional: false, status: 'TRANSFERRED', remark: 'Transferred to Satish' },
      { taskKey: 'INSURANCE', label: 'Insurance Transfer', isOptional: false, status: 'TRANSFERRED', remark: 'Transferred' },
      { taskKey: 'NOC', label: 'NOC / Clearance', isOptional: false, status: 'TRANSFERRED', remark: 'NOC received' },
      { taskKey: 'PUC', label: 'PUC Certificate', isOptional: false, status: 'TRANSFERRED', remark: 'PUC valid' },
      { taskKey: 'TAX', label: 'Road Tax', isOptional: false, status: 'NOT_REQUIRED', remark: 'BECAUSE DSA IS WORKING ON CLEARANCE' },
      { taskKey: 'FITNESS', label: 'Fitness Certificate', isOptional: true, status: 'NOT_REQUIRED', remark: 'BECAUSE DSA IS WORKING ON CLEARANCE' },
      { taskKey: 'HSRP', label: 'HSRP Plate', isOptional: true, status: 'TRANSFERRED', remark: 'Fitted' },
    ],
  };

  const detailAnswer = buildTasksOperatorAnswer({
    message: 'CG 11 BN 7867 ke tasks aur remarks batao',
    toolName: 'tasks.compliance.detail',
    operatorData: sampleDetail,
  });

  assert.ok(detailAnswer);
  assert.match(detailAnswer, /CG 11 BN 7867/);
  assert.match(detailAnswer, /SATISH KUMAR BANJARE/);
  assert.match(detailAnswer, /9826100000/);
  assert.match(detailAnswer, /BECAUSE DSA IS WORKING/);
  assert.match(detailAnswer, /RC Transfer/);
  assert.match(detailAnswer, /Road Tax/);
  assert.match(detailAnswer, /Fitness Certificate/);
  assert.doesNotMatch(detailAnswer, /\[REDACTED/);
});
