export type UnifiedReportToolResult = {
  toolName: string;
  data: unknown;
  contract: {
    source: string;
    fetchedAt: string | Date;
  };
};

type StatusSummary = {
  pending: number;
  overdue: number;
  missed: number;
  inProgress: number;
  completed: number;
};

type ModuleAvailability = 'AVAILABLE' | 'PARTIAL' | 'UNAVAILABLE';

type UnifiedModule = {
  label: string;
  tools: string[];
  availability: ModuleAvailability;
  dataSource: string | null;
  lastUpdated: string | null;
  reportingPeriod: { days: number; from: string; to: string };
  status: StatusSummary;
  items: unknown[];
  failure?: { reason: string; tools: string[] };
};

type ReportModuleKey =
  | 'dashboard'
  | 'crm'
  | 'listings'
  | 'soldVehicles'
  | 'rto'
  | 'vehicleDocs'
  | 'tasks'
  | 'verifications'
  | 'partners'
  | 'finance'
  | 'accounts'
  | 'payments'
  | 'recruitment';

type ToolCall = {
  toolName: string;
  data?: unknown;
  result?: UnifiedReportToolResult;
  error?: unknown;
};

export type UnifiedOperationsReport = {
  reportType: 'UNIFIED_OPERATIONS_REPORT';
  generatedAt: string;
  dataSource: 'database';
  lastUpdated: string;
  reportingPeriod: { days: number; from: string; to: string };
  checks: {
    totalTools: number;
    availableTools: number;
    failedTools: number;
    failedToolsList: Array<{ tool: string; reason: string }>;
    failedToolsByName: Array<{ tool: string; reason: string }>;
  };
  toolConnectivity: Array<{
    tool: string;
    status: 'CONNECTED' | 'FAILED';
    dataSource: string | null;
    lastUpdated: string | null;
    reason?: string;
  }>;
  modules: Record<ReportModuleKey, UnifiedModule>;
  crmReconciliation: {
    conflictCount: number;
    conflicts: unknown[];
    rule: string;
  };
  financeVerification: {
    sourceRecordsAvailable: boolean;
    grossProfit: number | null;
    netProfit: number | null;
    gst: number | null;
    receivedPayment: number | null;
    outstanding: number | null;
    verifiedFrom: string[];
    warnings: string[];
  };
};

export type UnifiedOperationsReportInput = {
  days?: number;
  now?: Date;
  readTool: (toolName: string, args: Record<string, unknown>) => Promise<UnifiedReportToolResult>;
  connectivityTools?: readonly string[];
  toolArgumentsFor?: (toolName: string, days: number) => Record<string, unknown>;
};

const MODULE_PLANS: Array<{ key: ReportModuleKey; label: string; tools: string[] }> = [
  { key: 'dashboard', label: 'Dashboard', tools: ['dashboard.summary'] },
  { key: 'crm', label: 'CRM', tools: ['crm.leads.summary', 'crm.followups'] },
  { key: 'listings', label: 'Listings', tools: ['listing.summary'] },
  { key: 'soldVehicles', label: 'Sold Vehicles', tools: ['sold.vehicles'] },
  { key: 'rto', label: 'RTO', tools: ['rto.pending.tasks', 'rto.documents.summary'] },
  { key: 'vehicleDocs', label: 'Vehicle Documents', tools: ['rto.documents.summary'] },
  { key: 'tasks', label: 'Tasks', tools: ['tasks.summary'] },
  { key: 'verifications', label: 'Verifications', tools: ['verification.summary'] },
  { key: 'partners', label: 'Partners', tools: ['partner.statistics'] },
  { key: 'finance', label: 'Finance', tools: ['revenue.summary', 'margin.summary'] },
  { key: 'accounts', label: 'Accounts', tools: ['sell.accounts.summary', 'accounting.summary', 'journal.summary'] },
  { key: 'payments', label: 'Payments', tools: ['payment.summary'] },
  { key: 'recruitment', label: 'Recruitment', tools: ['recruitment.summary'] },
];

const MODULES_WITH_ITEM_ROWS = new Set<ReportModuleKey>(['rto', 'vehicleDocs', 'tasks']);

const EMPTY_STATUS = (): StatusSummary => ({ pending: 0, overdue: 0, missed: 0, inProgress: 0, completed: 0 });

const asRecord = (value: unknown): Record<string, unknown> => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
);

const asArray = (value: unknown): unknown[] => Array.isArray(value) ? value : [];

const numberValue = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
};

const add = (status: StatusSummary, key: keyof StatusSummary, value: number | null) => {
  if (value !== null && value >= 0) status[key] += value;
};

const statusForValue = (value: unknown): keyof StatusSummary | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.toUpperCase().replace(/[\s-]+/gu, '_');
  if (normalized.includes('OVERDUE')) return 'overdue';
  if (normalized.includes('MISSED')) return 'missed';
  if (['DONE', 'COMPLETED', 'COMPLETE', 'PUBLISHED', 'SOLD', 'HIRED', 'TRANSFERRED', 'SUCCESS'].includes(normalized)) return 'completed';
  if (['IN_PROGRESS', 'PROCESSING', 'UNDER_REVIEW', 'REVIEW_PENDING', 'SUBMITTED', 'ISSUED'].includes(normalized)) return 'inProgress';
  if (['PENDING', 'DRAFT', 'NEW', 'AWAITING', 'BACKLOG', 'PENDING_APPROVAL', 'CHANGES_REQUESTED'].includes(normalized)) return 'pending';
  return null;
};

const statusFromItems = (items: unknown[]): StatusSummary => {
  const status = EMPTY_STATUS();
  for (const item of items) {
    const record = asRecord(item);
    const key = statusForValue(record.status ?? record.currentStatus ?? record.stage);
    if (key) status[key] += 1;
  }
  return status;
};

const mergeStatus = (target: StatusSummary, source: StatusSummary) => {
  target.pending += source.pending;
  target.overdue += source.overdue;
  target.missed += source.missed;
  target.inProgress += source.inProgress;
  target.completed += source.completed;
};

const statusFromData = (toolName: string, data: unknown): StatusSummary => {
  const record = asRecord(data);
  const status = EMPTY_STATUS();
  const items = extractItems(data);
  const itemStatus = statusFromItems(items);

  if (toolName === 'crm.followups') {
    add(status, 'overdue', numberValue(record.overdue));
    add(status, 'pending', (numberValue(record.today) ?? 0) + (numberValue(record.upcoming) ?? 0));
    add(status, 'missed', numberValue(record.missed));
    add(status, 'completed', numberValue(record.doneToday));
    return status;
  }
  const addStatusRows = (rows: unknown[]) => {
    for (const row of rows) {
      const statusRow = asRecord(row);
      const key = statusForValue(statusRow.status ?? statusRow.stage);
      if (key) add(status, key, numberValue(statusRow.count));
    }
  };
  const explicitGroups: unknown[] = [
    record.byStatus,
    record.statusCounts,
    record.pipeline,
    record.byDealStatus,
    record.byOnboardingStatus,
  ];
  const hasExplicitGroups = explicitGroups.some((group) => Array.isArray(group)
    ? group.length > 0
    : Object.keys(asRecord(group)).length > 0);
  if (!hasExplicitGroups) mergeStatus(status, itemStatus);
  for (const group of explicitGroups) {
    if (Array.isArray(group)) addStatusRows(group);
    else {
      for (const [statusKey, statusValue] of Object.entries(asRecord(group))) {
        const key = statusForValue(statusKey);
        if (key) add(status, key, numberValue(statusValue));
      }
    }
  }
  for (const source of Object.values(asRecord(record.sources))) {
    addStatusRows(asArray(asRecord(source).byStatus));
  }
  const taskSummary = asRecord(record.taskSummary);
  for (const key of ['pending', 'overdue', 'missed', 'inProgress', 'completed'] as const) {
    add(status, key, numberValue(taskSummary[key]));
  }
  for (const source of asArray(record.sources)) {
    const sourceRecord = asRecord(source);
    add(status, 'pending', numberValue(sourceRecord.pending));
    add(status, 'completed', numberValue(sourceRecord.success));
  }
  if (!hasExplicitGroups) {
    const aliases: Array<[keyof StatusSummary, string[]]> = [
      ['pending', ['pending', 'awaiting', 'backlog', 'newApplications']],
      ['overdue', ['overdue']],
      ['missed', ['missed']],
      ['inProgress', ['inProgress', 'processing', 'underReview', 'submitted']],
      ['completed', ['completed', 'done', 'doneToday', 'hiredCandidates', 'selectedCandidates', 'published']],
    ];
    for (const [key, names] of aliases) {
      for (const name of names) add(status, key, numberValue(record[name]));
    }
    const stats = asRecord(record.stats);
    for (const [key, names] of aliases) {
      for (const name of names) add(status, key, numberValue(stats[name]));
    }
  }
  return status;
};

const extractItems = (data: unknown): unknown[] => {
  if (Array.isArray(data)) return data.slice(0, 50);
  const record = asRecord(data);
  for (const key of ['items', 'records', 'rows', 'listings', 'applications', 'documents', 'campaigns']) {
    if (Array.isArray(record[key])) return (record[key] as unknown[]).slice(0, 50);
  }
  return [];
};

const safeErrorReason = (error: unknown): string => {
  const code = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
    ? error.code
    : '';
  if (code === 'AI_TOOL_PERMISSION_REQUIRED') return 'permission denied';
  if (code === 'AI_TOOL_NOT_CONFIGURED' || code === 'AI_KNOWLEDGE_NOT_CONFIGURED') return 'tool not configured';
  if (code === 'AI_TOOL_DATA_UNAVAILABLE' || code === 'P2021' || code === 'P2022') return 'database unavailable';
  if (code === 'AI_TOOL_ARGUMENTS_INVALID') return 'invalid tool arguments';
  return 'tool execution failed';
};

const iso = (value: string | Date): string => value instanceof Date ? value.toISOString() : new Date(value).toISOString();

const buildReportingPeriod = (days: number, now: Date) => ({
  days,
  from: new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString(),
  to: now.toISOString(),
});

const buildModule = (
  plan: { key: ReportModuleKey; label: string; tools: string[] },
  calls: ToolCall[],
  reportingPeriod: UnifiedModule['reportingPeriod'],
): UnifiedModule => {
  const successful = calls.filter((call) => call.result);
  const failed = calls.filter((call) => call.error);
  const timestamps = successful.map((call) => iso(call.result!.contract.fetchedAt)).sort();
  const status = EMPTY_STATUS();
  const items: unknown[] = [];
  for (const call of successful) {
    mergeStatus(status, statusFromData(call.toolName, call.result!.data));
    items.push(...extractItems(call.result!.data));
  }
  const availability: ModuleAvailability = successful.length === 0 ? 'UNAVAILABLE' : failed.length ? 'PARTIAL' : 'AVAILABLE';
  const module: UnifiedModule = {
    label: plan.label,
    tools: plan.tools,
    availability,
    dataSource: successful.length ? [...new Set(successful.map((call) => call.result!.contract.source))].join(', ') : null,
    lastUpdated: timestamps.at(-1) ?? null,
    reportingPeriod,
    status,
    // The unified report is a status/reporting snapshot. Keep detailed rows only
    // for work queues where the operator explicitly needs the individual records;
    // aggregate modules remain complete through their counts and source metadata.
    items: MODULES_WITH_ITEM_ROWS.has(plan.key) ? items.slice(0, 20) : [],
  };
  if (failed.length) {
    module.failure = {
      reason: safeErrorReason(failed[0]?.error),
      tools: failed.map((call) => call.toolName),
    };
  }
  return module;
};

const reconcileCrm = (calls: ToolCall[]) => {
  const conflicts: unknown[] = [];
  for (const call of calls.filter((item) => item.toolName === 'crm.followups' && item.result)) {
    const data = asRecord(call.result!.data);
    const reconciliation = asRecord(data.reconciliation);
    conflicts.push(...asArray(reconciliation.conflicts).slice(0, 20));
    for (const item of extractItems(data)) {
      const record = asRecord(item);
      if ((record.status === 'DONE' && record.missedAt) || (record.status === 'MISSED' && record.completedAt)) conflicts.push(item);
    }
  }
  return {
    conflictCount: conflicts.length,
    conflicts: conflicts.slice(0, 20),
    rule: 'DONE और MISSED को एक साथ active status नहीं माना जाता; contradictory records अलग reconciliation queue में दिखते हैं।',
  };
};

const financeVerification = (calls: ToolCall[]) => {
  const dataFor = (toolName: string) => asRecord(calls.find((call) => call.toolName === toolName && call.result)?.result?.data);
  const marginTotals = asRecord(dataFor('margin.summary').totals);
  const accountTotals = asRecord(dataFor('sell.accounts.summary').totals);
  const sellAmount = numberValue(marginTotals.sellAmount) ?? numberValue(accountTotals.sellAmount);
  const purchaseAmount = numberValue(marginTotals.purchaseAmount) ?? numberValue(accountTotals.purchaseAmount);
  const expenses = numberValue(marginTotals.expenses) ?? numberValue(accountTotals.expenses);
  const grossProfit = sellAmount !== null && purchaseAmount !== null ? sellAmount - purchaseAmount : null;
  const netProfit = grossProfit !== null && expenses !== null ? grossProfit - expenses : null;
  const storedNetProfit = numberValue(marginTotals.netProfit);
  const afterGst = numberValue(marginTotals.netProfitAfterGst);
  const gst = storedNetProfit !== null && afterGst !== null ? storedNetProfit - afterGst : null;
  const paymentData = dataFor('payment.summary');
  const receiptRows = asArray(paymentData.saleReceiptsByStatus);
  const receivedPayment: number | null = receiptRows.length
    ? receiptRows.reduce<number>((sum, row) => {
      const record = asRecord(row);
      return record.side === 'PURCHASER_RECEIPT' && record.receiptStatus === 'ISSUED'
        ? sum + (numberValue(record.amount) ?? 0)
        : sum;
    }, 0)
    : null;
  const warnings: string[] = [];
  if (receivedPayment === null) warnings.push('received payment source उपलब्ध नहीं है; Outstanding की गणना नहीं की गई।');
  if (sellAmount === null) warnings.push('Sell amount source उपलब्ध नहीं है।');
  if (grossProfit !== null && storedNetProfit !== null && Math.abs((grossProfit - (expenses ?? 0)) - storedNetProfit) > 0.01) {
    warnings.push('Stored net profit और source-record calculation में अंतर मिला।');
  }
  return {
    sourceRecordsAvailable: sellAmount !== null && receivedPayment !== null,
    grossProfit,
    netProfit,
    gst,
    receivedPayment,
    outstanding: sellAmount !== null && receivedPayment !== null ? sellAmount - receivedPayment : null,
    verifiedFrom: ['sell.accounts.summary', 'margin.summary', 'payment.summary'].filter((toolName) => calls.some((call) => call.toolName === toolName && call.result)),
    warnings,
  };
};

export const buildUnifiedOperationsReport = async (input: UnifiedOperationsReportInput): Promise<UnifiedOperationsReport> => {
  const now = input.now ?? new Date();
  const days = Math.min(90, Math.max(1, Math.floor(input.days ?? 30)));
  const reportingPeriod = buildReportingPeriod(days, now);
  const reportTools = [...new Set(MODULE_PLANS.flatMap((plan) => plan.tools))];
  const plannedTools = [...new Set(input.connectivityTools ?? reportTools)];
  const defaultArgumentsFor = (toolName: string, forReport: boolean): Record<string, unknown> => {
    if (forReport) {
      if (toolName === 'dashboard.summary' || toolName === 'revenue.summary' || toolName === 'margin.summary' || toolName === 'sell.accounts.summary' || toolName === 'accounting.summary' || toolName === 'journal.summary') return { days };
      if (toolName === 'crm.followups' || toolName === 'partner.statistics' || toolName === 'recruitment.summary') return toolName === 'crm.followups' ? { owner: 'all' } : {};
      if (toolName === 'crm.leads.summary' || toolName === 'listing.summary' || toolName === 'tasks.summary' || toolName === 'rto.pending.tasks') return { limit: 20 };
      if (toolName === 'sold.vehicles' || toolName === 'rto.documents.summary' || toolName === 'payment.summary') return { days, limit: 20 };
    }
    if (toolName === 'knowledge.search') return { query: 'connectivity check', limit: 1 };
    if (toolName === 'listing.detail' || toolName === 'crm.lead.detail' || toolName === 'enquiry.detail' || toolName === 'customer.detail' || toolName === 'vehicle.identity' || toolName === 'vehicle.documents.detail' || toolName === 'crm.lead.copilot' || toolName === 'kyc.copilot') return { query: 'connectivity-check' };
    if (toolName === 'crm.leads.summary' || toolName === 'customer.summary' || toolName === 'enquiry.summary' || toolName === 'listing.summary') return { limit: 1 };
    if (toolName === 'listing.search') return { query: 'connectivity-check', limit: 1 };
    if (toolName === 'forecast.operations') return { metric: 'sales', days, horizon: 7 };
    if (toolName === 'crm.followups') return { owner: 'all' };
    if (toolName === 'pending.kyc' || toolName === 'hot.leads' || toolName === 'rto.pending.tasks' || toolName === 'tasks.summary') return { limit: 1 };
    if (toolName === 'partner.statistics' || toolName === 'recruitment.summary' || toolName === 'recruitment.copilot' || toolName === 'surepass.status') return {};
    if (toolName === 'dashboard.summary' || toolName === 'lead.statistics' || toolName === 'listing.statistics' || toolName === 'inventory.trend' || toolName === 'revenue.summary' || toolName === 'finance.trend' || toolName === 'finance.copilot' || toolName === 'whatsapp.activity.summary' || toolName === 'verification.summary' || toolName === 'whatsapp.status' || toolName === 'whatsapp.campaigns.summary' || toolName === 'communication.delivery.summary' || toolName === 'sms.activity.summary' || toolName === 'notifications.summary' || toolName === 'fraud.signals') return { days };
    return { days, limit: 1 };
  };
  const calls = await Promise.all(plannedTools.map(async (toolName): Promise<ToolCall> => {
    try {
      const args = input.toolArgumentsFor?.(toolName, days) ?? defaultArgumentsFor(toolName, reportTools.includes(toolName));
      return { toolName, result: await input.readTool(toolName, args) };
    } catch (error) {
      return { toolName, error };
    }
  }));
  const modules = Object.fromEntries(MODULE_PLANS.map((plan) => [
    plan.key,
    buildModule(plan, calls.filter((call) => plan.tools.includes(call.toolName)), reportingPeriod),
  ])) as Record<ReportModuleKey, UnifiedModule>;
  const failedToolsList = calls.filter((call) => call.error).map((call) => ({ tool: call.toolName, reason: safeErrorReason(call.error) }));
  const toolConnectivity = calls.map((call) => call.result
    ? {
      tool: call.toolName,
      status: 'CONNECTED' as const,
      dataSource: call.result.contract.source,
      lastUpdated: iso(call.result.contract.fetchedAt),
    }
    : {
      tool: call.toolName,
      status: 'FAILED' as const,
      dataSource: null,
      lastUpdated: null,
      reason: safeErrorReason(call.error),
    });
  return {
    reportType: 'UNIFIED_OPERATIONS_REPORT',
    generatedAt: now.toISOString(),
    dataSource: 'database',
    lastUpdated: now.toISOString(),
    reportingPeriod,
    checks: {
      totalTools: calls.length,
      availableTools: calls.filter((call) => call.result).length,
      failedTools: failedToolsList.length,
      failedToolsList,
      failedToolsByName: failedToolsList,
    },
    toolConnectivity,
    modules,
    crmReconciliation: reconcileCrm(calls),
    financeVerification: financeVerification(calls),
  };
};
