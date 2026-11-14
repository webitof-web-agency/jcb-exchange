import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AI_READ_ONLY_TOOL_NAMES,
  AiReadOnlyToolsService,
  type AiReadOnlyToolDependencies,
  type AiToolContext,
} from './aiReadOnlyTools.service';
import { routeAiMessage } from './aiIntentRouter.service';
import { AiGatewayService, type AiRuntimeConfig } from './aiGateway.service';
import { AiProviderError } from './aiProvider.service';
import {
  AI_PHASE7_SCENARIOS,
  AI_PHASE7_TOOL_MATRIX,
  AI_PHASE7_LANGUAGE_CASES,
  type AiPhase7Scenario,
} from './aiPhase7TestMatrix';

const context: AiToolContext = {
  userId: 'employee-1',
  role: 'EMPLOYEE',
  permissions: ['ALL_ACCESS'],
};

const validArguments: Record<string, unknown> = {
  'dashboard.summary': {},
  'operations.unified.report': {},
  'knowledge.search': { query: 'approved policy' },
  'pending.kyc': {},
  'kyc.copilot': { partnerCode: 'PARTNER-001' },
  'hot.leads': {},
  'crm.leads.summary': {},
  'crm.lead.detail': { query: 'JCB 3DX' },
  'crm.lead.copilot': { query: 'JCB 3DX' },
  'crm.dashboard.summary': {},
  'crm.contacts.summary': {},
  'crm.won.customers.summary': {},
  'crm.contact.detail': { query: 'Ramesh' },
  'crm.campaigns.summary': {},
  'crm.import.summary': {},
  'ai.documents.search': { query: 'Ramesh', kind: 'all', limit: 10 },
  'market.intelligence': {},
  'customer.summary': {},
  'customer.detail': { query: 'Ramesh' },
  'enquiry.summary': {},
  'enquiry.detail': { query: 'JCB 3DX' },
  'tasks.summary': {},
  'lead.statistics': {},
  'listing.summary': {},
  'listing.statistics': {},
  'listing.detail': { query: 'JCB 3DX' },
  'vehicle.identity': { query: 'CG04NF0268' },
  'vehicle.documents.detail': { query: 'CG04NF0268' },
  'sold.vehicles': {},
  'inventory.trend': {},
  'revenue.summary': {},
  'partner.statistics': {},
  'partner.agreements.summary': {},
  'partner.performance': {},
  'partner.copilot': {},
  'finance.trend': {},
  'finance.copilot': {},
  'forecast.operations': { metric: 'sales', horizon: 7 },
  'rto.pending.tasks': {},
  'rto.documents.summary': {},
  'rto.copilot': {},
  'crm.followups': {},
  'recruitment.summary': {},
  'recruitment.copilot': {},
  'fraud.signals': {},
  'listing.search': { query: 'JCB' },
  'whatsapp.activity.summary': {},
  'verification.summary': {},
  'verification.history': { group: 'identity' },
  'surepass.status': {},
  'whatsapp.status': {},
  'whatsapp.campaigns.summary': {},
  'communication.delivery.summary': {},
  'sms.activity.summary': {},
  'notifications.summary': {},
  'finance.workspace.summary': {},
  'invoice.summary': {},
  'payment.summary': {},
  'margin.summary': {},
  'wallet.summary': {},
  'api.billing.summary': {},
  'sell.accounts.summary': {},
  'refund.summary': {},
  'accounting.summary': {},
  'journal.summary': {},
  'categories.summary': {},
  'brands.summary': {},
  'models.summary': {},
  'locations.summary': {},
  'blogs.summary': {},
  'translations.summary': {},
  'settings.summary': {},
  'users.summary': {},
  'roles.summary': {},
  'subscriptions.summary': {},
};

const dependenciesFor = (result: unknown): AiReadOnlyToolDependencies => ({
  dashboardSummary: async () => result,
  unifiedOperationsReport: async () => result,
  knowledgeSearch: async () => result,
  pendingKycCases: async () => result,
  kycCopilot: async () => result,
  hotLeads: async () => result,
  crmLeadsSummary: async () => result,
  crmLeadDetail: async () => result,
  crmLeadCopilot: async () => result,
  crmDashboardSummary: async () => result,
  crmContactsSummary: async () => result,
  crmContactDetail: async () => result,
  crmCampaignsSummary: async () => result,
  crmImportSummary: async () => result,
  aiDocumentsSearch: async () => result,
  marketIntelligence: async () => result,
  customerSummary: async () => result,
  customerDetail: async () => result,
  enquirySummary: async () => result,
  enquiryDetail: async () => result,
  tasksSummary: async () => result,
  leadStatistics: async () => result,
  analyticsSummary: async () => result,
  listingSummary: async () => result,
  listingStatistics: async () => result,
  listingDetail: async () => result,
  vehicleIdentity: async () => result,
  vehicleDocumentsDetail: async () => result,
  soldVehicles: async () => result,
  inventoryTrend: async () => result,
  revenueSummary: async () => result,
  partnerStatistics: async () => result,
  partnerAgreementsSummary: async () => result,
  partnerPerformance: async () => result,
  partnerCopilot: async () => result,
  financeTrend: async () => result,
  financeCopilot: async () => result,
  forecastOperations: async () => result,
  pendingRtoTasks: async () => result,
  rtoDocumentsSummary: async () => result,
  rtoCopilot: async () => result,
  crmFollowUps: async () => result,
  crmCallIntelligence: async () => result,
  recruitmentSummary: async () => result,
  recruitmentCopilot: async () => result,
  fraudSignals: async () => result,
  listingSearch: async () => result,
  whatsappActivitySummary: async () => result,
  verificationSummary: async () => result,
  verificationHistory: async () => result,
  surepassStatus: async () => result,
  whatsappStatus: async () => result,
  whatsappCampaignsSummary: async () => result,
  communicationDeliverySummary: async () => result,
  smsActivitySummary: async () => result,
  notificationsSummary: async () => result,
  financeWorkspaceSummary: async () => result,
  invoiceSummary: async () => result,
  paymentSummary: async () => result,
  marginSummary: async () => result,
  walletSummary: async () => result,
  apiBillingSummary: async () => result,
  sellAccountsSummary: async () => result,
  refundSummary: async () => result,
  accountingSummary: async () => result,
  journalSummary: async () => result,
  categoriesSummary: async () => result,
  brandsSummary: async () => result,
  modelsSummary: async () => result,
  locationsSummary: async () => result,
  blogsSummary: async () => result,
  translationsSummary: async () => result,
  settingsSummary: async () => result,
  usersSummary: async () => result,
  rolesSummary: async () => result,
  subscriptionsSummary: async () => result,
});

const dependencyFunctions = (error: Error): AiReadOnlyToolDependencies => ({
  dashboardSummary: async () => { throw error; },
  unifiedOperationsReport: async () => { throw error; },
  knowledgeSearch: async () => { throw error; },
  pendingKycCases: async () => { throw error; },
  kycCopilot: async () => { throw error; },
  hotLeads: async () => { throw error; },
  crmLeadsSummary: async () => { throw error; },
  crmLeadDetail: async () => { throw error; },
  crmLeadCopilot: async () => { throw error; },
  crmDashboardSummary: async () => { throw error; },
  crmContactsSummary: async () => { throw error; },
  crmContactDetail: async () => { throw error; },
  crmCampaignsSummary: async () => { throw error; },
  crmImportSummary: async () => { throw error; },
  aiDocumentsSearch: async () => { throw error; },
  marketIntelligence: async () => { throw error; },
  customerSummary: async () => { throw error; },
  customerDetail: async () => { throw error; },
  enquirySummary: async () => { throw error; },
  enquiryDetail: async () => { throw error; },
  tasksSummary: async () => { throw error; },
  leadStatistics: async () => { throw error; },
  analyticsSummary: async () => { throw error; },
  listingSummary: async () => { throw error; },
  listingStatistics: async () => { throw error; },
  listingDetail: async () => { throw error; },
  vehicleIdentity: async () => { throw error; },
  vehicleDocumentsDetail: async () => { throw error; },
  soldVehicles: async () => { throw error; },
  inventoryTrend: async () => { throw error; },
  revenueSummary: async () => { throw error; },
  partnerStatistics: async () => { throw error; },
  partnerAgreementsSummary: async () => { throw error; },
  partnerPerformance: async () => { throw error; },
  partnerCopilot: async () => { throw error; },
  financeTrend: async () => { throw error; },
  financeCopilot: async () => { throw error; },
  forecastOperations: async () => { throw error; },
  pendingRtoTasks: async () => { throw error; },
  rtoDocumentsSummary: async () => { throw error; },
  rtoCopilot: async () => { throw error; },
  crmFollowUps: async () => { throw error; },
  crmCallIntelligence: async () => { throw error; },
  recruitmentSummary: async () => { throw error; },
  recruitmentCopilot: async () => { throw error; },
  fraudSignals: async () => { throw error; },
  listingSearch: async () => { throw error; },
  whatsappActivitySummary: async () => { throw error; },
  verificationSummary: async () => { throw error; },
  verificationHistory: async () => { throw error; },
  surepassStatus: async () => { throw error; },
  whatsappStatus: async () => { throw error; },
  whatsappCampaignsSummary: async () => { throw error; },
  communicationDeliverySummary: async () => { throw error; },
  smsActivitySummary: async () => { throw error; },
  notificationsSummary: async () => { throw error; },
  financeWorkspaceSummary: async () => { throw error; },
  invoiceSummary: async () => { throw error; },
  paymentSummary: async () => { throw error; },
  marginSummary: async () => { throw error; },
  walletSummary: async () => { throw error; },
  apiBillingSummary: async () => { throw error; },
  sellAccountsSummary: async () => { throw error; },
  refundSummary: async () => { throw error; },
  accountingSummary: async () => { throw error; },
  journalSummary: async () => { throw error; },
  categoriesSummary: async () => { throw error; },
  brandsSummary: async () => { throw error; },
  modelsSummary: async () => { throw error; },
  locationsSummary: async () => { throw error; },
  blogsSummary: async () => { throw error; },
  translationsSummary: async () => { throw error; },
  settingsSummary: async () => { throw error; },
  usersSummary: async () => { throw error; },
  rolesSummary: async () => { throw error; },
  subscriptionsSummary: async () => { throw error; },
});

const runForEveryTool = async (
  createService: () => AiReadOnlyToolsService,
  assertion: (toolName: (typeof AI_READ_ONLY_TOOL_NAMES)[number], service: AiReadOnlyToolsService) => Promise<void>,
) => {
  for (const toolName of AI_READ_ONLY_TOOL_NAMES) await assertion(toolName, createService());
};

test('Phase 7 matrix covers every allow-listed tool and every required scenario', () => {
  assert.deepEqual(AI_PHASE7_TOOL_MATRIX.map((entry) => entry.toolName), [...AI_READ_ONLY_TOOL_NAMES]);
  assert.equal(new Set(AI_PHASE7_TOOL_MATRIX.map((entry) => entry.toolName)).size, AI_READ_ONLY_TOOL_NAMES.length);

  for (const entry of AI_PHASE7_TOOL_MATRIX) {
    assert.deepEqual([...entry.scenarios].sort(), [...AI_PHASE7_SCENARIOS].sort(), entry.toolName);
  }
});

test('Phase 7 language matrix routes English, Hindi, Hinglish, spelling, and mixed messages safely', () => {
  for (const entry of AI_PHASE7_LANGUAGE_CASES) {
    assert.equal(routeAiMessage(entry.english)?.name, entry.toolName, `${entry.toolName}: English`);
    assert.equal(routeAiMessage(entry.hindi)?.name, entry.toolName, `${entry.toolName}: Hindi`);
    assert.equal(routeAiMessage(entry.hinglish)?.name, entry.toolName, `${entry.toolName}: Hinglish`);
    assert.equal(routeAiMessage(entry.spellingMistake)?.name, entry.toolName, `${entry.toolName}: spelling`);
    assert.equal(routeAiMessage(entry.mixedLanguage)?.name, entry.toolName, `${entry.toolName}: mixed`);
  }
});

test('Phase 7 valid-result case returns a success contract for every tool', async () => {
  await runForEveryTool(
    () => new AiReadOnlyToolsService(dependenciesFor({ total: 1, items: [{ id: 'record-1' }] })),
    async (toolName, service) => {
      const result = await service.execute(context, { name: toolName, arguments: validArguments[toolName] });
      assert.equal(result.contract.status, 'success', toolName);
      assert.equal(result.contract.permission, 'allowed', toolName);
      assert.equal(result.contract.source, toolName === 'knowledge.search' ? 'cache' : 'database', toolName);
      const expectedLimit = toolName === 'ai.documents.search' ? 10 : 20;
      assert.equal(result.contract.pagination.limit, expectedLimit, `${toolName}: pagination limit`);
      assert.equal(result.contract.pagination.offset, 0, `${toolName}: pagination offset`);
      assert.equal(result.contract.pagination.hasMore, false, `${toolName}: pagination hasMore`);
      assert.equal(result.contract.pagination.nextCursor, null, `${toolName}: pagination cursor`);
      assert.equal(result.contract.safeLimits.maxLimit, 20, `${toolName}: max limit`);
      assert.equal(result.contract.safeLimits.maxDays, 90, `${toolName}: max days`);
    },
  );
});

test('Phase 7 empty-result case is explicit for every tool', async () => {
  await runForEveryTool(
    () => new AiReadOnlyToolsService(dependenciesFor([])),
    async (toolName, service) => {
      const result = await service.execute(context, { name: toolName, arguments: validArguments[toolName] });
      assert.equal(result.contract.status, 'empty', toolName);
      assert.equal(result.dataAvailability, 'UNAVAILABLE', toolName);
      assert.equal(result.contract.pagination.returned, 0, `${toolName}: empty returned`);
      assert.equal(result.contract.pagination.hasMore, false, `${toolName}: empty hasMore`);
      const expectedLimit = toolName === 'ai.documents.search' ? 10 : 20;
      assert.equal(result.contract.safeLimits.appliedLimit, expectedLimit, `${toolName}: empty applied limit`);
    },
  );
});

test('Phase 7 permission-denied case fails closed for every tool', async () => {
  const restricted: AiToolContext = { ...context, permissions: ['ai.use'] };
  await runForEveryTool(
    () => new AiReadOnlyToolsService(dependenciesFor({ total: 1 })),
    async (toolName, service) => {
      await assert.rejects(
        () => service.execute(restricted, { name: toolName, arguments: validArguments[toolName] }),
        (error: unknown) => error instanceof Error
          && 'contract' in error
          && typeof error.contract === 'object'
          && error.contract !== null
          && 'status' in error.contract
          && error.contract.status === 'permission_denied'
          && 'pagination' in error.contract
          && 'safeLimits' in error.contract,
        toolName,
      );
    },
  );
});

test('Phase 7 database and Surepass unavailable cases never expose provider errors', async () => {
  const unavailable = new Error('database password and Surepass token must not leak');
  await runForEveryTool(
    () => new AiReadOnlyToolsService(dependencyFunctions(unavailable)),
    async (toolName, service) => {
      await assert.rejects(
        () => service.execute(context, { name: toolName, arguments: validArguments[toolName] }),
        (error: unknown) => error instanceof Error
          && error.message === 'The requested data is unavailable right now.'
          && 'contract' in error
          && typeof error.contract === 'object'
          && error.contract !== null
          && 'status' in error.contract
          && error.contract.status === 'data_unavailable'
          && !error.message.includes('password')
          && !error.message.includes('token'),
        toolName,
      );
    },
  );
});

test('Phase 7 invalid-input case returns validation_error for every tool', async () => {
  await runForEveryTool(
    () => new AiReadOnlyToolsService(dependenciesFor({ total: 1 })),
    async (toolName, service) => {
      await assert.rejects(
        () => service.execute(context, { name: toolName, arguments: { unexpected: true } }),
        (error: unknown) => error instanceof Error
          && 'contract' in error
          && typeof error.contract === 'object'
          && error.contract !== null
          && 'status' in error.contract
          && error.contract.status === 'validation_error',
        toolName,
      );
    },
  );
});

test('Phase 7 sensitive-field case keeps raw PII, URLs, and credentials out of every tool result', async () => {
  const sensitiveFixture = {
    total: 1,
    ownerName: 'Private Owner',
    mobileNumber: '9876543210',
    documentUrl: 'https://files.example.test/rc.pdf?token=private-token',
    accessToken: 'private-provider-token',
    items: [{ ownerPhone: '9876543210', signedUrl: 'https://files.example.test/a?token=secret' }],
  };
  await runForEveryTool(
    () => new AiReadOnlyToolsService(dependenciesFor(sensitiveFixture)),
    async (toolName, service) => {
      const result = await service.execute(context, { name: toolName, arguments: validArguments[toolName] });
      const serialized = JSON.stringify(result.data);
      assert.equal(serialized.includes('9876543210'), false, toolName);
      assert.equal(serialized.includes('private-token'), false, toolName);
      assert.equal(serialized.includes('private-provider-token'), false, toolName);
      assert.equal(serialized.includes('Private Owner'), false, toolName);
    },
  );
});

test('Phase 7 duplicate-record case preserves source evidence without mutating it', async () => {
  const duplicateItems = [{ id: 'same-record' }, { id: 'same-record' }];
  const service = new AiReadOnlyToolsService(dependenciesFor({ found: true, items: duplicateItems }));
  const result = await service.execute(context, {
    name: 'listing.detail',
    arguments: { query: 'duplicate vehicle' },
  });
  assert.deepEqual((result.data as { items: unknown[] }).items, [{}, {}]);
  assert.equal(result.contract.status, 'success');
});

test('Phase 7 valid and invalid identifier cases stay inside the intended read-only boundary', async () => {
  const listingId = '6fc03e62-6ba2-4e2c-8f5e-12eaa2b9d7ac';
  assert.deepEqual(routeAiMessage(`listing id ${listingId} ka detail batao`), {
    name: 'listing.detail',
    arguments: { listingId },
  });
  assert.deepEqual(routeAiMessage('CG04NF0268 ka owner batao'), {
    name: 'vehicle.identity',
    arguments: { query: 'CG04NF0268' },
  });

  const service = new AiReadOnlyToolsService(dependenciesFor({ found: true }));
  for (const request of [
    { name: 'listing.detail', arguments: { listingId: 'not-a-uuid' } },
    { name: 'vehicle.identity', arguments: { listingId: 'not-a-uuid' } },
  ]) {
    await assert.rejects(
      () => service.execute(context, request),
      (error: unknown) => error instanceof Error
        && 'contract' in error
        && typeof error.contract === 'object'
        && error.contract !== null
        && 'status' in error.contract
        && error.contract.status === 'validation_error',
    );
  }
});

test('Phase 7 provider-unavailable case is safe and actionable without leaking provider details', async () => {
  const config: AiRuntimeConfig = {
    enabled: true,
    provider: 'openai',
    model: 'gpt-4.1',
    apiKey: 'test-key',
    maxInputChars: 4000,
    maxOutputChars: 12000,
  };
  const gateway = new AiGatewayService({
    configReader: () => config,
    providerFactory: () => ({
      complete: async () => {
        throw new AiProviderError('raw upstream token must not be shown', 502, 'AI_PROVIDER_REQUEST_FAILED');
      },
    }),
    auditWriter: async () => undefined,
  });

  await assert.rejects(
    () => gateway.chat({ userId: 'employee-1', role: 'EMPLOYEE', message: 'show listing count' }),
    (error: unknown) => error instanceof Error
      && error.message === 'The selected model was rejected by the provider. Refresh models or choose another compatible model.'
      && 'contract' in error
      && typeof error.contract === 'object'
      && error.contract !== null
      && 'status' in error.contract
      && error.contract.status === 'provider_unavailable'
      && !error.message.includes('token'),
  );
});

test('Phase 7 mutation requests never select a read-only tool', () => {
  const mutationMessages = [
    'delete this listing',
    'update partner status',
    'send this WhatsApp message',
    'approve this KYC case',
    'नई listing बनाओ',
  ];
  for (const message of mutationMessages) assert.equal(routeAiMessage(message), null, message);
});

test('Phase 7 matrix types remain exhaustive at compile time', () => {
  const scenario: AiPhase7Scenario = 'provider_unavailable';
  assert.ok(AI_PHASE7_SCENARIOS.includes(scenario));
});
