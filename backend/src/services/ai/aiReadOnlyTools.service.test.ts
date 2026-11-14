import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AI_READ_ONLY_TOOL_NAMES,
  AiReadOnlyToolsService,
  customerScopeWhereForAi,
  safeFinanceTransactionItem,
  safePartnerSummaryItem,
  safeRecruitmentApplicationItem,
  safeVerificationItem,
  safeWhatsAppActivityItem,
  safeSmsActivityItem,
  type AiToolExecutionObservability,
  type AiReadOnlyToolDependencies,
  type AiToolContext,
} from './aiReadOnlyTools.service';

test('safe partner and finance list projections omit sensitive fields', () => {
  assert.deepEqual(safePartnerSummaryItem({
    userId: 'user-1',
    partnerCode: 'CG-01',
    businessName: 'JCB Partner',
    ownerName: 'Private Owner',
    gstNumber: 'PRIVATE-GST',
    accountStatus: 'ACTIVE',
    kycStatus: 'VERIFIED',
    onboardingStatus: 'COMPLETED',
    partnerType: 'DEALER',
    createdAt: new Date('2026-11-13T00:00:00.000Z'),
  }), {
    partnerCode: 'CG-01',
    businessName: 'JCB Partner',
    partnerType: 'DEALER',
    accountStatus: 'ACTIVE',
    kycStatus: 'VERIFIED',
    onboardingStatus: 'COMPLETED',
    createdAt: '2026-11-13T00:00:00.000Z',
  });

  assert.deepEqual(safeFinanceTransactionItem({
    id: 'txn-1',
    transactionDate: new Date('2026-11-13T00:00:00.000Z'),
    type: 'CREDIT',
    amount: { toNumber: () => 125000 },
    balance: { toNumber: () => 500000 },
    accountName: 'Cash',
    paymentMethod: 'BANK_TRANSFER',
    category: 'Sale',
    status: 'POSTED',
    name: 'Private Customer',
    narration: 'Private narration',
    reference: 'PRIVATE-REFERENCE',
  }), {
    transactionId: 'txn-1',
    transactionDate: '2026-11-13T00:00:00.000Z',
    type: 'CREDIT',
    amount: 125000,
    balance: 500000,
    accountName: 'Cash',
    paymentMethod: 'BANK_TRANSFER',
    category: 'Sale',
    status: 'POSTED',
  });
});

test('Phase 4 verification and communication projections remain provider-safe', () => {
  assert.deepEqual(safeVerificationItem({
    id: 'verification-1',
    source: 'PAN',
    status: 'SUCCESS',
    maskedIdentifier: 'XXXXXX1234',
    safeMessage: 'Verified successfully',
    messageCode: 'VERIFIED',
    createdAt: new Date('2026-11-13T00:00:00.000Z'),
    completedAt: new Date('2026-11-13T00:01:00.000Z'),
    encryptedResult: 'must-not-leak',
    ownerName: 'Private Owner',
  }), {
    recordId: 'verification-1',
    source: 'PAN',
    status: 'SUCCESS',
    maskedIdentifier: 'XXXXXX1234',
    messageCode: 'VERIFIED',
    safeMessage: 'Verified successfully',
    createdAt: '2026-11-13T00:00:00.000Z',
    completedAt: '2026-11-13T00:01:00.000Z',
  });

  assert.deepEqual(safeWhatsAppActivityItem({
    id: 'wa-1',
    eventCode: 'listing_update',
    relatedEntityType: 'LISTING',
    status: 'DELIVERED',
    recipientPhone: '+91-9999999999',
    payloadSnapshot: { secret: 'nope' },
    createdAt: new Date('2026-11-13T00:00:00.000Z'),
    deliveredAt: new Date('2026-11-13T00:02:00.000Z'),
  }), {
    messageId: 'wa-1',
    eventCode: 'listing_update',
    relatedEntityType: 'LISTING',
    status: 'DELIVERED',
    createdAt: '2026-11-13T00:00:00.000Z',
    sentAt: null,
    deliveredAt: '2026-11-13T00:02:00.000Z',
    readAt: null,
  });

  assert.deepEqual(safeSmsActivityItem({
    id: 'sms-1',
    eventCode: 'lead_ack',
    status: 'SENT',
    recipientPhone: '+91-9999999999',
    messageBody: 'private',
    createdAt: new Date('2026-11-13T00:00:00.000Z'),
  }), {
    messageId: 'sms-1',
    eventCode: 'lead_ack',
    status: 'SENT',
    createdAt: '2026-11-13T00:00:00.000Z',
    sentAt: null,
  });

  assert.deepEqual(safeRecruitmentApplicationItem({
    id: 'application-1',
    applicationRef: 'APP-001',
    currentStage: 'INTERVIEW',
    appliedAt: new Date('2026-11-13T00:00:00.000Z'),
    overallRating: 4,
    candidate: { id: 'candidate-1', fullName: 'Private Candidate', email: 'private@example.com' },
    job: { title: 'Machine Operator', jobCode: 'JOB-001' },
  }), {
    applicationId: 'application-1',
    applicationRef: 'APP-001',
    stage: 'INTERVIEW',
    jobTitle: 'Machine Operator',
    jobCode: 'JOB-001',
    candidateId: 'candidate-1',
    appliedAt: '2026-11-13T00:00:00.000Z',
    overallRating: 4,
  });
});

const context: AiToolContext = {
  userId: 'employee-1',
  role: 'EMPLOYEE',
  permissions: [
    'dashboard.view',
    'kyc.manage',
  'crm.read',
    'crm.manage',
    'crm.reports',
    'visitors.read',
    'enquiries.manage',
    'listings.read',
    'analytics.read',
    'finance.read',
    'fh.dashboard.read',
    'fh.reports.read',
    'fh.books.read',
    'fh.sales.read',
    'fh.purchases.read',
    'fh.arap.read',
    'partners.read',
    'accounts.rto.read',
    'tasks.read',
    'recruitment.dashboard.read',
    'recruitment.offers.read',
    'whatsapp.read',
    'sms.read',
    'pan.verification.read',
    'gst.verification.read',
    'aadhaar.digilocker.read',
    'driving-license.verification.read',
    'rc.owner-history.read',
    'categories.read',
    'brands.read',
    'blog.read',
    'translations.manage',
    'settings.manage',
    'users.read',
    'roles.read',
  ],
};

const dependencies: AiReadOnlyToolDependencies = {
  dashboardSummary: async () => ({ totalPartners: 4 }),
  unifiedOperationsReport: async () => ({ reportType: 'UNIFIED_OPERATIONS_REPORT', modules: {} }),
  pendingKycCases: async () => ({ pending: 2 }),
  hotLeads: async () => ({ items: [{ score: 90 }] }),
  leadStatistics: async () => ({ totals: { created: 10 } }),
  analyticsSummary: async () => ({ periodDays: 30, totalEvents: 10, byEventType: [] }),
  crmLeadsSummary: async () => ({ total: 4, items: [] }),
  crmLeadDetail: async () => ({ found: true }),
  customerSummary: async () => ({ total: 3, items: [] }),
  customerDetail: async () => ({ found: true }),
  enquirySummary: async () => ({ total: 2, items: [] }),
  enquiryDetail: async () => ({ found: true }),
  tasksSummary: async () => ({ total: 1, items: [] }),
  listingStatistics: async () => ({ total: 6 }),
  listingSummary: async () => ({ total: 6, items: [] }),
  revenueSummary: async () => ({ sales: 100 }),
  partnerStatistics: async () => ({ total: 4 }),
  partnerAgreementsSummary: async () => ({ total: 0, items: [] }),
  pendingRtoTasks: async () => ({ pending: 3 }),
  crmFollowUps: async () => ({ overdue: 1 }),
  crmCallIntelligence: async () => ({ totalCalls: 0 }),
  recruitmentSummary: async () => ({ activeJobs: 2 }),
  listingSearch: async () => [{ id: 'listing-1' }],
  whatsappActivitySummary: async () => ({ sent: 4 }),
  listingDetail: async () => ({ found: true, item: { listingId: 'listing-1' } }),
  soldVehicles: async () => ({ total: 2, items: [] }),
  inventoryTrend: async () => ({ periodDays: 30, trend: [] }),
  partnerPerformance: async () => ({ periodDays: 30, partners: [] }),
  financeTrend: async () => ({ periodDays: 30, trend: [] }),
  forecastOperations: async () => ({ metric: 'sales', confidenceScore: 75 }),
  vehicleIdentity: async () => ({ found: true, matches: [] }),
  vehicleDocumentsDetail: async () => ({ found: true, items: [] }),
  rtoDocumentsSummary: async () => ({ total: 0, items: [] }),
  verificationSummary: async () => ({ periodDays: 30, total: 4, sources: [] }),
  verificationHistory: async () => ({ group: 'identity', returned: 0, items: [] }),
  surepassStatus: async () => ({ provider: 'SUREPASS', configured: true }),
  whatsappStatus: async () => ({ enabled: true, templates: [] }),
  whatsappCampaignsSummary: async () => ({ total: 1, campaigns: [] }),
  communicationDeliverySummary: async () => ({ total: 2, channels: {} }),
  smsActivitySummary: async () => ({ periodDays: 30, total: 2 }),
  notificationsSummary: async () => ({ periodDays: 30, total: 3, unread: 1 }),
  financeWorkspaceSummary: async () => ({ periods: 2, accounts: 10 }),
  invoiceSummary: async () => ({ invoices: 3, bills: 1 }),
  paymentSummary: async () => ({ total: 4, amount: 125000 }),
  marginSummary: async () => ({ netProfit: 30000, marginPercent: 12 }),
  walletSummary: async () => ({ balance: 5000, currency: 'INR' }),
  apiBillingSummary: async () => ({ usageCount: 4, chargedAmount: 120 }),
  sellAccountsSummary: async () => ({ total: 5, items: [] }),
  refundSummary: async () => ({ total: 1, amount: 5000 }),
  accountingSummary: async () => ({ accounts: 12, vouchers: 20 }),
  journalSummary: async () => ({ vouchers: 8, debit: 10000, credit: 10000 }),
  categoriesSummary: async () => ({ total: 3, items: [] }),
  brandsSummary: async () => ({ total: 4, items: [] }),
  modelsSummary: async () => ({ total: 8, items: [] }),
  locationsSummary: async () => ({ total: 5, items: [] }),
  blogsSummary: async () => ({ total: 2, items: [] }),
  translationsSummary: async () => ({ totalKeys: 10, overrides: 2 }),
  settingsSummary: async () => ({ configured: true }),
  usersSummary: async () => ({ total: 6 }),
  rolesSummary: async () => ({ total: 3, items: [] }),
  subscriptionsSummary: async () => ({ total: 4, amount: 12000 }),
};

test('customer AI access preserves visitor-wide access but scopes CRM-only employees to their contacts', () => {
  assert.deepEqual(customerScopeWhereForAi({
    userId: 'employee-1',
    role: 'EMPLOYEE',
    permissions: ['visitors.read'],
  }), {});

  assert.deepEqual(customerScopeWhereForAi({
    userId: 'employee-1',
    role: 'EMPLOYEE',
    permissions: ['crm.read'],
  }), {
    OR: [
      { leads: { some: { ownerId: 'employee-1' } } },
      { crmProfile: { ownerId: 'employee-1' } },
    ],
  });
});

test('read-only tool registry exposes the complete allow-list', () => {
  const service = new AiReadOnlyToolsService(dependencies);
  const tools = service.listTools(context);

  assert.deepEqual(tools.map((tool) => tool.name), AI_READ_ONLY_TOOL_NAMES);
  assert.equal(tools.length, AI_READ_ONLY_TOOL_NAMES.length);
  assert.equal(tools.every((tool) => tool.available), true);
});

test('executes CRM and listing summary/detail tools through their injected dependencies', async () => {
  const calls: string[] = [];
  const service = new AiReadOnlyToolsService({
    ...dependencies,
    crmLeadsSummary: async () => { calls.push('crm.leads.summary'); return { total: 3, items: [] }; },
    crmLeadDetail: async () => { calls.push('crm.lead.detail'); return { found: true }; },
    listingSummary: async () => { calls.push('listing.summary'); return { total: 2, items: [] }; },
  });

  await service.execute(context, { name: 'crm.leads.summary' });
  await service.execute(context, { name: 'crm.lead.detail', arguments: { query: 'ramesh' } });
  await service.execute(context, { name: 'listing.summary' });

  assert.deepEqual(calls, ['crm.leads.summary', 'crm.lead.detail', 'listing.summary']);
});

test('keeps file actions in the portal response and out of the provider contract', async () => {
  const service = new AiReadOnlyToolsService({
    ...dependencies,
    aiDocumentsSearch: async () => ({
      data: { found: true, items: [{ kind: 'RESUME', candidate: 'Candidate' }] },
      uiActions: [{
        type: 'FILE',
        label: 'Resume',
        fileName: 'resume.pdf',
        mimeType: 'application/pdf',
        url: '/api/documents/secure/drive-private-file-123',
        previewable: true,
        downloadable: true,
      }],
    }),
  });

  const result = await service.execute(context, { name: 'ai.documents.search', arguments: { query: 'Candidate', kind: 'resume' } });

  assert.equal(result.uiActions?.[0]?.url, '/api/documents/secure/drive-private-file-123');
  assert.equal(JSON.stringify(result.contract).includes('/api/documents/secure/drive-private-file-123'), false);
  assert.equal(JSON.stringify(result.contract).includes('uiActions'), false);
});

test('accepts authorized RTO proofs and offer letters as retrievable document kinds', async () => {
  const service = new AiReadOnlyToolsService({
    ...dependencies,
    aiDocumentsSearch: async (_context, args) => ({
      data: { found: true, kind: args.kind, items: [] },
      uiActions: [],
    }),
  });

  const rto = await service.execute(context, { name: 'ai.documents.search', arguments: { query: 'CG04NF0268', kind: 'rto' } });
  const offer = await service.execute(context, { name: 'ai.documents.search', arguments: { query: 'APP-001', kind: 'offer' } });

  assert.equal((rto.data as { kind: string }).kind, 'rto');
  assert.equal((offer.data as { kind: string }).kind, 'offer');
});

test('grounds approved knowledge through the cache contract and keeps source data bounded', async () => {
  const service = new AiReadOnlyToolsService({
    ...dependencies,
    knowledgeSearch: async (_context, args) => ({
      found: true,
      query: args.query,
      sources: [{ title: 'KYC SOP', category: 'KYC', content: 'Use the approved checklist.', sourceUrl: 'https://example.com/kyc' }],
    }),
  });

  const result = await service.execute(context, { name: 'knowledge.search', arguments: { query: 'KYC checklist' } });
  assert.equal(result.contract.source, 'cache');
  assert.equal(result.contract.status, 'success');
  assert.equal(JSON.stringify(result.contract.data).includes('sourceKey'), false);
});

test('executes Phase 3 customer, enquiry, and task tools through their injected dependencies', async () => {
  const calls: string[] = [];
  const service = new AiReadOnlyToolsService({
    ...dependencies,
    customerSummary: async () => { calls.push('customer.summary'); return { total: 2 }; },
    customerDetail: async () => { calls.push('customer.detail'); return { found: true }; },
    enquirySummary: async () => { calls.push('enquiry.summary'); return { total: 1 }; },
    enquiryDetail: async () => { calls.push('enquiry.detail'); return { found: true }; },
    tasksSummary: async () => { calls.push('tasks.summary'); return { total: 3 }; },
  });

  await service.execute(context, { name: 'customer.summary' });
  await service.execute(context, { name: 'customer.detail', arguments: { query: 'Ramesh' } });
  await service.execute(context, { name: 'enquiry.summary' });
  await service.execute(context, { name: 'enquiry.detail', arguments: { query: 'JCB 3DX' } });
  await service.execute(context, { name: 'tasks.summary' });

  assert.deepEqual(calls, [
    'customer.summary',
    'customer.detail',
    'enquiry.summary',
    'enquiry.detail',
    'tasks.summary',
  ]);
});

test('executes Won Customers through the CRM contacts source with a mandatory WON filter', async () => {
  let received: unknown;
  const service = new AiReadOnlyToolsService({
    ...dependencies,
    crmContactsSummary: async (_context, args) => {
      received = args;
      return { total: 3, activeAccounts: 3, primeCustomers: 1, wonLeads: 3, items: [] };
    },
  });

  const result = await service.execute(context, { name: 'crm.won.customers.summary' });

  assert.deepEqual(received, { pipelineStage: 'WON' });
  assert.equal(result.toolName, 'crm.won.customers.summary');
  assert.deepEqual(result.data, { total: 3, activeAccounts: 3, primeCustomers: 1, wonLeads: 3, items: [] });
});

test('tool execution is permission-scoped and calls only the selected dependency', async () => {
  let calls = 0;
  const service = new AiReadOnlyToolsService({
    ...dependencies,
    listingSearch: async (_context, args) => {
      calls += 1;
      return [{ query: args.query, limit: args.limit }];
    },
  });

  const result = await service.execute(context, {
    name: 'listing.search',
    arguments: { query: 'JCB 3DX', limit: 5 },
  });

  assert.equal(calls, 1);
  assert.equal(result.toolName, 'listing.search');
  assert.deepEqual(result.data, [{ query: 'JCB 3DX', limit: 5 }]);
  assert.equal(result.contract.status, 'success');
  assert.equal(result.contract.source, 'database');
  assert.equal(result.contract.permission, 'allowed');
  assert.deepEqual(result.contract.data, result.data);
  assert.deepEqual(result.contract.pagination, {
    limit: 5,
    offset: 0,
    returned: 1,
    total: null,
    hasMore: false,
    nextCursor: null,
  });
  assert.deepEqual(result.contract.safeLimits, {
    maxLimit: 20,
    maxDays: 90,
    requestedLimit: 5,
    appliedLimit: 5,
  });
});

test('tool execution returns the empty contract for an empty result', async () => {
  const service = new AiReadOnlyToolsService({
    ...dependencies,
    listingSearch: async () => [],
  });

  const result = await service.execute(context, {
    name: 'listing.search',
    arguments: { query: 'missing vehicle' },
  });

  assert.equal(result.contract.status, 'empty');
  assert.equal(result.contract.source, 'database');
  assert.deepEqual(result.contract.data, []);
});

test('provider-safe field security is applied to every tool result', async () => {
  const service = new AiReadOnlyToolsService({
    ...dependencies,
    listingStatistics: async () => ({
      ownerName: 'Ramesh Kumar',
      mobileNumber: '9876543210',
      documentUrl: 'https://files.example.com/vehicle.pdf?token=secret',
      total: 3,
    }),
  });

  const result = await service.execute(context, { name: 'listing.statistics', arguments: { days: 30 } });
  const data = result.data as Record<string, unknown>;
  assert.equal(data.ownerName, '[REDACTED_PII]');
  assert.equal(data.mobileNumber, '[REDACTED_MOBILE]');
  assert.equal(data.documentUrl, '[REDACTED_DOCUMENT_URL]');
  assert.equal(data.total, 3);
  assert.ok(result.contract.maskedFields.includes('ownerName'));
  assert.deepEqual(result.contract.data, result.data);
});

test('permission failures expose a denied common contract without sensitive data', async () => {
  const service = new AiReadOnlyToolsService(dependencies);

  await assert.rejects(
    () => service.execute({ ...context, permissions: ['ai.use'] }, {
      name: 'finance.trend',
      arguments: { days: 30 },
    }),
    (error: unknown) => error instanceof Error
      && 'contract' in error
      && typeof error.contract === 'object'
      && error.contract !== null
      && 'status' in error.contract
      && error.contract.status === 'permission_denied'
      && 'permission' in error.contract
      && error.contract.permission === 'denied'
      && 'data' in error.contract
      && error.contract.data === null,
  );
});

test('unexpected data-source failures become a safe data-unavailable contract', async () => {
  const service = new AiReadOnlyToolsService({
    ...dependencies,
    listingStatistics: async () => { throw new Error('database credentials must not leak'); },
  });

  await assert.rejects(
    () => service.execute(context, { name: 'listing.statistics', arguments: { days: 30 } }),
    (error: unknown) => error instanceof Error
      && error.message === 'The requested data is unavailable right now.'
      && 'code' in error
      && error.code === 'AI_TOOL_DATA_UNAVAILABLE'
      && 'contract' in error
      && typeof error.contract === 'object'
      && error.contract !== null
      && 'status' in error.contract
      && error.contract.status === 'data_unavailable'
      && 'data' in error.contract
      && error.contract.data === null,
  );
});

test('executes each Phase 3 read-only tool through its injected dependency', async () => {
  const calls: string[] = [];
  const service = new AiReadOnlyToolsService({
    ...dependencies,
    listingDetail: async () => { calls.push('listing.detail'); return { found: true }; },
    soldVehicles: async () => { calls.push('sold.vehicles'); return { total: 1 }; },
    inventoryTrend: async () => { calls.push('inventory.trend'); return { periodDays: 30 }; },
    partnerPerformance: async () => { calls.push('partner.performance'); return { partners: [] }; },
    financeTrend: async () => { calls.push('finance.trend'); return { trend: [] }; },
  });

  await service.execute(context, { name: 'listing.detail', arguments: { query: 'JCB 3DX' } });
  await service.execute(context, { name: 'sold.vehicles', arguments: { days: 30 } });
  await service.execute(context, { name: 'inventory.trend', arguments: { days: 30 } });
  await service.execute(context, { name: 'partner.performance', arguments: { days: 30 } });
  await service.execute(context, { name: 'finance.trend', arguments: { days: 30 } });

  assert.deepEqual(calls, ['listing.detail', 'sold.vehicles', 'inventory.trend', 'partner.performance', 'finance.trend']);
});

test('executes Phase 2 vehicle identity and RTO documents tools through injected dependencies', async () => {
  const calls: string[] = [];
  const service = new AiReadOnlyToolsService({
    ...dependencies,
    vehicleIdentity: async () => { calls.push('vehicle.identity'); return { found: true }; },
    rtoDocumentsSummary: async () => { calls.push('rto.documents.summary'); return { total: 1 }; },
  });

  await service.execute(context, { name: 'vehicle.identity', arguments: { query: 'CG04NF0268' } });
  await service.execute(context, { name: 'rto.documents.summary', arguments: { days: 30, limit: 5 } });

  assert.deepEqual(calls, ['vehicle.identity', 'rto.documents.summary']);
});

test('passes identifier arguments to listing detail and partner performance tools', async () => {
  const received: Array<Record<string, unknown>> = [];
  const service = new AiReadOnlyToolsService({
    ...dependencies,
    listingDetail: async (_context, args) => { received.push(args); return { found: true }; },
    partnerPerformance: async (_context, args) => { received.push(args); return { partners: [] }; },
  });

  await service.execute(context, {
    name: 'listing.detail',
    arguments: { invoiceNumber: 'JCB/26-27/0001' },
  });
  await service.execute(context, {
    name: 'partner.performance',
    arguments: { partnerCode: 'CG-RAIPUR-01', days: 7 },
  });

  assert.deepEqual(received, [
    { invoiceNumber: 'JCB/26-27/0001' },
    { partnerCode: 'CG-RAIPUR-01', days: 7 },
  ]);
});

test('executes Phase 3 verification and communication tools through injected dependencies', async () => {
  const calls: string[] = [];
  const service = new AiReadOnlyToolsService({
    ...dependencies,
    verificationSummary: async () => { calls.push('verification.summary'); return { total: 1 }; },
    surepassStatus: async () => { calls.push('surepass.status'); return { configured: true }; },
    whatsappStatus: async () => { calls.push('whatsapp.status'); return { enabled: true }; },
    smsActivitySummary: async () => { calls.push('sms.activity.summary'); return { total: 1 }; },
    notificationsSummary: async () => { calls.push('notifications.summary'); return { unread: 1 }; },
  });

  await service.execute(context, { name: 'verification.summary', arguments: { days: 30 } });
  await service.execute(context, { name: 'surepass.status' });
  await service.execute(context, { name: 'whatsapp.status', arguments: { days: 7 } });
  await service.execute(context, { name: 'sms.activity.summary', arguments: { days: 14 } });
  await service.execute(context, { name: 'notifications.summary', arguments: { days: 30 } });

  assert.deepEqual(calls, [
    'verification.summary',
    'surepass.status',
    'whatsapp.status',
    'sms.activity.summary',
    'notifications.summary',
  ]);
});

test('executes Phase 4 campaign and combined delivery-log tools through injected dependencies', async () => {
  const calls: string[] = [];
  const service = new AiReadOnlyToolsService({
    ...dependencies,
    whatsappCampaignsSummary: async () => { calls.push('whatsapp.campaigns.summary'); return { total: 1 }; },
    communicationDeliverySummary: async () => { calls.push('communication.delivery.summary'); return { total: 2 }; },
  });

  await service.execute(context, { name: 'whatsapp.campaigns.summary', arguments: { days: 30 } });
  await service.execute(context, { name: 'communication.delivery.summary', arguments: { days: 7 } });

  assert.deepEqual(calls, ['whatsapp.campaigns.summary', 'communication.delivery.summary']);
});

test('executes Phase 5 finance and commercial tools through injected dependencies', async () => {
  const calls: string[] = [];
  const service = new AiReadOnlyToolsService({
    ...dependencies,
    financeWorkspaceSummary: async () => { calls.push('finance.workspace.summary'); return { accounts: 2 }; },
    invoiceSummary: async () => { calls.push('invoice.summary'); return { invoices: 1 }; },
    paymentSummary: async () => { calls.push('payment.summary'); return { total: 1 }; },
    marginSummary: async () => { calls.push('margin.summary'); return { netProfit: 1 }; },
    walletSummary: async () => { calls.push('wallet.summary'); return { balance: 1 }; },
    apiBillingSummary: async () => { calls.push('api.billing.summary'); return { usageCount: 1 }; },
    sellAccountsSummary: async () => { calls.push('sell.accounts.summary'); return { total: 1 }; },
    refundSummary: async () => { calls.push('refund.summary'); return { total: 1 }; },
    accountingSummary: async () => { calls.push('accounting.summary'); return { accounts: 1 }; },
    journalSummary: async () => { calls.push('journal.summary'); return { vouchers: 1 }; },
  });

  for (const name of [
    'finance.workspace.summary', 'invoice.summary', 'payment.summary', 'margin.summary',
    'wallet.summary', 'api.billing.summary', 'sell.accounts.summary', 'refund.summary',
    'accounting.summary', 'journal.summary',
  ] as const) {
    await service.execute(context, { name, arguments: { days: 30, limit: 10 } });
  }

  assert.deepEqual(calls, [
    'finance.workspace.summary', 'invoice.summary', 'payment.summary', 'margin.summary',
    'wallet.summary', 'api.billing.summary', 'sell.accounts.summary', 'refund.summary',
    'accounting.summary', 'journal.summary',
  ]);
});

test('executes Phase 6 remaining-module tools through injected dependencies', async () => {
  const calls: string[] = [];
  const service = new AiReadOnlyToolsService({
    ...dependencies,
    categoriesSummary: async () => { calls.push('categories.summary'); return { total: 1 }; },
    brandsSummary: async () => { calls.push('brands.summary'); return { total: 1 }; },
    modelsSummary: async () => { calls.push('models.summary'); return { total: 1 }; },
    locationsSummary: async () => { calls.push('locations.summary'); return { total: 1 }; },
    blogsSummary: async () => { calls.push('blogs.summary'); return { total: 1 }; },
    translationsSummary: async () => { calls.push('translations.summary'); return { totalKeys: 1 }; },
    settingsSummary: async () => { calls.push('settings.summary'); return { configured: true }; },
    usersSummary: async () => { calls.push('users.summary'); return { total: 1 }; },
    rolesSummary: async () => { calls.push('roles.summary'); return { total: 1 }; },
    subscriptionsSummary: async () => { calls.push('subscriptions.summary'); return { total: 1 }; },
  });

  for (const name of [
    'categories.summary', 'brands.summary', 'models.summary', 'locations.summary',
    'blogs.summary', 'translations.summary', 'settings.summary', 'users.summary',
    'roles.summary', 'subscriptions.summary',
  ] as const) {
    await service.execute(context, { name, arguments: { days: 30, limit: 10 } });
  }

  assert.deepEqual(calls, [
    'categories.summary', 'brands.summary', 'models.summary', 'locations.summary',
    'blogs.summary', 'translations.summary', 'settings.summary', 'users.summary',
    'roles.summary', 'subscriptions.summary',
  ]);
});

test('executes the Phase 4 forecast tool through its injected dependency', async () => {
  let calls = 0;
  const service = new AiReadOnlyToolsService({
    ...dependencies,
    forecastOperations: async (_context, args) => {
      calls += 1;
      return { metric: args.metric, days: args.days, horizon: args.horizon, confidenceScore: 82 };
    },
  });

  const result = await service.execute(context, {
    name: 'forecast.operations',
    arguments: { metric: 'inventory', days: 30, horizon: 7 },
  });

  assert.equal(calls, 1);
  assert.deepEqual(result.data, { metric: 'inventory', days: 30, horizon: 7, confidenceScore: 82 });
});

test('unknown, malformed, and over-broad tool requests fail closed', async () => {
  const service = new AiReadOnlyToolsService(dependencies);

  await assert.rejects(
    () => service.execute(context, { name: 'database.query' }),
    (error: unknown) => error instanceof Error && error.message.includes('not available'),
  );
  await assert.rejects(
    () => service.execute(context, { name: 'listing.search', arguments: { query: '' } }),
    (error: unknown) => error instanceof Error && error.message.includes('arguments'),
  );
  await assert.rejects(
    () => service.execute(context, { name: 'listing.search', arguments: { query: 'x'.repeat(101) } }),
    (error: unknown) => error instanceof Error && error.message.includes('arguments'),
  );
});

test('an employee without the module permission cannot execute that tool', async () => {
  const service = new AiReadOnlyToolsService(dependencies);
  const restricted: AiToolContext = { ...context, permissions: ['ai.use'] };

  await assert.rejects(
    () => service.execute(restricted, { name: 'listing.search', arguments: { query: 'JCB' } }),
    (error: unknown) => error instanceof Error && error.message.includes('permission'),
  );
  await assert.rejects(
    () => service.execute(restricted, { name: 'finance.trend', arguments: { days: 30 } }),
    (error: unknown) => error instanceof Error && error.message.includes('permission'),
  );
});

test('forecast enforces the permission required by the selected metric', async () => {
  const financeOnly: AiToolContext = { ...context, permissions: ['finance.read'] };
  const service = new AiReadOnlyToolsService(dependencies);

  await assert.rejects(
    () => service.execute(financeOnly, { name: 'forecast.operations', arguments: { metric: 'inventory' } }),
    (error: unknown) => error instanceof Error && error.message.includes('permission'),
  );
});

test('admin roles retain internal access while the tool remains read-only', async () => {
  const service = new AiReadOnlyToolsService(dependencies);
  const result = await service.execute(
    { userId: 'admin-1', role: 'ADMIN', permissions: [] },
    { name: 'revenue.summary' },
  );

  assert.deepEqual(result.data, { sales: 100 });
});

test('records successful tool execution latency and data availability without changing the payload shape', async () => {
  const events: Array<Record<string, unknown>> = [];
  const observability: AiToolExecutionObservability = {
    recordExecution: async (event) => { events.push(event as Record<string, unknown>); },
  };
  const service = new AiReadOnlyToolsService({
    ...dependencies,
    listingSearch: async () => [],
  }, observability);

  const result = await service.execute(context, {
    name: 'listing.search',
    arguments: { query: 'missing vehicle' },
  });

  assert.deepEqual(result.data, []);
  assert.equal(result.dataAvailability, 'UNAVAILABLE');
  assert.equal(result.dataAvailabilityMessage, 'No matching records were found.');
  assert.equal(events.length, 1);
  const successEvent = events[0];
  assert.ok(successEvent);
  assert.equal(successEvent.status, 'SUCCEEDED');
  assert.equal(successEvent.permission, 'ALLOWED');
  assert.equal(successEvent.dataAvailability, 'UNAVAILABLE');
  assert.equal(successEvent.module, 'listings');
  assert.equal(typeof successEvent.databaseLatencyMs, 'number');
  assert.equal(successEvent.emptyData, true);
  assert.equal(typeof successEvent.durationMs, 'number');
});

test('keeps nested summaries available when they contain positive counts', async () => {
  const service = new AiReadOnlyToolsService({
    ...dependencies,
    recruitmentSummary: async () => ({
      stats: { activeJobs: 2, candidates: 7 },
      pipeline: [],
    }),
  });

  const result = await service.execute(context, { name: 'recruitment.summary' });

  assert.equal(result.dataAvailability, 'AVAILABLE');
  assert.equal(result.dataAvailabilityMessage, undefined);
});

test('records denied tool execution for the permission audit trail', async () => {
  const events: Array<Record<string, unknown>> = [];
  const observability: AiToolExecutionObservability = {
    recordExecution: async (event) => { events.push(event as Record<string, unknown>); },
  };
  const service = new AiReadOnlyToolsService(dependencies, observability);

  await assert.rejects(
    () => service.execute({ ...context, permissions: ['ai.use'] }, {
      name: 'finance.trend',
      arguments: { days: 30 },
    }),
    (error: unknown) => error instanceof Error && error.message.includes('permission'),
  );

  assert.equal(events.length, 1);
  const deniedEvent = events[0];
  assert.ok(deniedEvent);
  assert.equal(deniedEvent.status, 'FAILED');
  assert.equal(deniedEvent.permission, 'DENIED');
  assert.equal(deniedEvent.errorCode, 'AI_TOOL_PERMISSION_REQUIRED');
});

test('all registered tools fail closed for an employee without module permissions', async () => {
  const service = new AiReadOnlyToolsService(dependencies);
  const restricted: AiToolContext = { ...context, permissions: ['ai.use'] };
  const argumentsByTool: Record<string, unknown> = {
    'dashboard.summary': { days: 30 },
    'pending.kyc': { limit: 10 },
    'hot.leads': { limit: 10 },
    'lead.statistics': { days: 30 },
    'listing.statistics': { days: 30 },
    'listing.detail': { query: 'JCB' },
    'sold.vehicles': { days: 30 },
    'inventory.trend': { days: 30 },
    'revenue.summary': { days: 30 },
    'partner.statistics': {},
    'partner.performance': { days: 30 },
    'finance.trend': { days: 30 },
    'forecast.operations': { metric: 'sales', days: 30, horizon: 7 },
    'rto.pending.tasks': { limit: 10 },
    'crm.followups': { owner: 'all' },
    'recruitment.summary': {},
    'listing.search': { query: 'JCB' },
    'whatsapp.activity.summary': { days: 30 },
    'vehicle.identity': { query: 'CG04NF0268' },
    'rto.documents.summary': { days: 30, limit: 10 },
    'verification.summary': { days: 30 },
    'surepass.status': {},
    'whatsapp.status': { days: 30 },
    'sms.activity.summary': { days: 30 },
    'notifications.summary': { days: 30 },
  };

  for (const toolName of AI_READ_ONLY_TOOL_NAMES) {
    assert.equal(service.listTools(restricted).find((tool) => tool.name === toolName)?.available, false);
    await assert.rejects(
      () => service.execute(restricted, { name: toolName, arguments: argumentsByTool[toolName] }),
      (error: unknown) => error instanceof Error && error.message.includes('permission'),
    );
  }
});
