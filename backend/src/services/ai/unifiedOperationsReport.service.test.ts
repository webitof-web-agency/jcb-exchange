import assert from 'node:assert/strict';
import test from 'node:test';
import { buildUnifiedOperationsReport, type UnifiedReportToolResult } from './unifiedOperationsReport.service';

const resultFor = (toolName: string, data: unknown, fetchedAt = '2026-11-14T10:00:00.000Z'): UnifiedReportToolResult => ({
  toolName,
  data,
  contract: {
    source: 'database',
    fetchedAt,
  },
});

test('builds one report with per-module status, source, freshness, period, and failed-tool evidence', async () => {
  const report = await buildUnifiedOperationsReport({
    now: new Date('2026-11-14T10:00:00.000Z'),
    days: 30,
    readTool: async (toolName) => {
      if (toolName === 'partner.statistics') throw Object.assign(new Error('permission denied'), { code: 'AI_TOOL_PERMISSION_REQUIRED' });
      if (toolName === 'rto.pending.tasks') return resultFor(toolName, {
        pendingCount: 2,
        items: [
          { vehicleNumber: 'CG04NF0268', task: 'RC Transfer', status: 'PENDING', dueDate: null },
          { vehicleNumber: 'CG04NF0269', task: 'Insurance', status: 'IN_PROGRESS', dueDate: null },
        ],
        dueDateStatus: 'NOT_CONFIGURED',
      });
      if (toolName === 'rto.documents.summary') return resultFor(toolName, { total: 0, items: [] });
      if (toolName === 'crm.followups') return resultFor(toolName, {
        overdue: 1,
        today: 2,
        upcoming: 3,
        doneToday: 4,
        missed: 1,
        reconciliation: { conflicts: [{ status: 'DONE', missedAt: '2026-11-13T10:00:00.000Z' }] },
      });
      if (toolName === 'margin.summary') return resultFor(toolName, {
        totals: { purchaseAmount: 100, sellAmount: 160, expenses: 10, netProfit: 50, netProfitAfterGst: 45 },
      });
      if (toolName === 'payment.summary') return resultFor(toolName, {
        totals: { saleReceiptAmount: 120 },
        saleReceiptsByStatus: [{ side: 'PURCHASER_RECEIPT', receiptStatus: 'ISSUED', amount: 120 }],
      });
      if (toolName === 'sell.accounts.summary') return resultFor(toolName, {
        totals: { sellAmount: 160, purchaseAmount: 100, expenses: 10 },
      });
      return resultFor(toolName, { total: 1, items: [{ status: 'PENDING' }] });
    },
  });

  assert.equal(report.reportType, 'UNIFIED_OPERATIONS_REPORT');
  assert.equal(report.reportingPeriod.from, '2026-10-15T10:00:00.000Z');
  assert.equal(report.reportingPeriod.to, '2026-11-14T10:00:00.000Z');
  assert.equal(report.modules.rto.availability, 'AVAILABLE');
  assert.equal(report.modules.rto.status.pending, 1);
  assert.equal(report.modules.rto.status.inProgress, 1);
  assert.equal(report.modules.rto.items.length, 2);
  const firstRtoItem = report.modules.rto.items[0] as Record<string, unknown>;
  assert.equal(firstRtoItem.vehicleNumber, 'CG04NF0268');
  assert.equal(firstRtoItem.dueDate, null);
  assert.equal(report.modules.partners.availability, 'UNAVAILABLE');
  assert.equal(report.modules.partners.failure?.reason, 'permission denied');
  assert.equal(report.crmReconciliation.conflictCount, 1);
  assert.equal(report.financeVerification.receivedPayment, 120);
  assert.equal(report.financeVerification.outstanding, 40);
  assert.equal(report.financeVerification.grossProfit, 60);
  assert.equal(report.financeVerification.netProfit, 50);
  assert.ok(report.modules.crm.lastUpdated);
  assert.deepEqual(report.checks.failedToolsByName, [{ tool: 'partner.statistics', reason: 'permission denied' }]);
});

test('does not invent outstanding when received payment source is unavailable', async () => {
  const report = await buildUnifiedOperationsReport({
    now: new Date('2026-11-14T10:00:00.000Z'),
    days: 30,
    readTool: async (toolName) => {
      if (toolName === 'payment.summary') throw Object.assign(new Error('database unavailable'), { code: 'AI_TOOL_DATA_UNAVAILABLE' });
      if (toolName === 'sell.accounts.summary') return resultFor(toolName, { totals: { sellAmount: 500 } });
      return resultFor(toolName, { total: 0, items: [] });
    },
  });

  assert.equal(report.financeVerification.receivedPayment, null);
  assert.equal(report.financeVerification.outstanding, null);
  assert.ok(report.financeVerification.warnings.some((warning) => warning.includes('received payment')));
});

test('uses complete bounded arguments for report modules while keeping non-report checks lightweight', async () => {
  const calls: Array<{ toolName: string; args: Record<string, unknown> }> = [];
  await buildUnifiedOperationsReport({
    now: new Date('2026-11-14T10:00:00.000Z'),
    days: 30,
    connectivityTools: ['rto.pending.tasks', 'rto.documents.summary', 'crm.leads.summary', 'listing.detail'],
    readTool: async (toolName, args) => {
      calls.push({ toolName, args });
      return resultFor(toolName, { total: 0, items: [] });
    },
  });

  assert.deepEqual(calls.find((call) => call.toolName === 'rto.pending.tasks')?.args, { limit: 20 });
  assert.deepEqual(calls.find((call) => call.toolName === 'rto.documents.summary')?.args, { days: 30, limit: 20 });
  assert.deepEqual(calls.find((call) => call.toolName === 'crm.leads.summary')?.args, { limit: 20 });
  assert.deepEqual(calls.find((call) => call.toolName === 'listing.detail')?.args, { query: 'connectivity-check' });
});
