import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AI_READ_ONLY_TOOL_NAMES,
  AiReadOnlyToolsService,
  type AiReadOnlyToolDependencies,
  type AiToolContext,
} from './aiReadOnlyTools.service';

const context: AiToolContext = {
  userId: 'employee-1',
  role: 'EMPLOYEE',
  permissions: [
    'dashboard.view',
    'kyc.manage',
    'crm.read',
    'crm.manage',
    'crm.reports',
    'listings.read',
    'finance.read',
    'partners.read',
    'accounts.rto.read',
    'tasks.read',
    'recruitment.dashboard.read',
    'whatsapp.read',
  ],
};

const dependencies: AiReadOnlyToolDependencies = {
  dashboardSummary: async () => ({ totalPartners: 4 }),
  pendingKycCases: async () => ({ pending: 2 }),
  hotLeads: async () => ({ items: [{ score: 90 }] }),
  leadStatistics: async () => ({ totals: { created: 10 } }),
  listingStatistics: async () => ({ total: 6 }),
  revenueSummary: async () => ({ sales: 100 }),
  partnerStatistics: async () => ({ total: 4 }),
  pendingRtoTasks: async () => ({ pending: 3 }),
  crmFollowUps: async () => ({ overdue: 1 }),
  recruitmentSummary: async () => ({ activeJobs: 2 }),
  listingSearch: async () => [{ id: 'listing-1' }],
  whatsappActivitySummary: async () => ({ sent: 4 }),
};

test('read-only tool registry exposes the complete allow-list', () => {
  const service = new AiReadOnlyToolsService(dependencies);
  const tools = service.listTools(context);

  assert.deepEqual(tools.map((tool) => tool.name), AI_READ_ONLY_TOOL_NAMES);
  assert.equal(tools.length, 12);
  assert.equal(tools.every((tool) => tool.available), true);
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
});

test('admin roles retain internal access while the tool remains read-only', async () => {
  const service = new AiReadOnlyToolsService(dependencies);
  const result = await service.execute(
    { userId: 'admin-1', role: 'ADMIN', permissions: [] },
    { name: 'revenue.summary' },
  );

  assert.deepEqual(result.data, { sales: 100 });
});
