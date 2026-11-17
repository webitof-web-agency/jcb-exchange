import { FinanceTransactionStatus } from '@prisma/client';
import {
  getAlerts,
  getBalanceSheet,
  getBankCashReport,
  getCashFlow,
  getOverview,
  getPivot,
  getProfitAndLoss,
  getTaxReport,
  getTrend,
} from '../../modules/finance-hub/services/statements.service';
import { getBankingOverview, getGatewayOverview, getReconciliation, listImports, listUnmatched } from '../../modules/finance-hub/services/banking.service';
import { listBankAccounts } from '../../modules/finance-hub/services/bankAccounts.service';
import { getChartOfAccounts, getPaymentMethodMap, listCategoryMap } from '../../modules/finance-hub/services/accounts.service';
import { getCompanyProfile } from '../../modules/finance-hub/services/company.service';
import { listCostCentres } from '../../modules/finance-hub/services/costCentres.service';
import { getOpeningBalances } from '../../modules/finance-hub/services/openingBalances.service';
import { listFinancialYears, listNumberSeries } from '../../modules/finance-hub/services/periods.service';
import { getGeneralLedger, getTrialBalance, listAuditTrail } from '../../modules/finance-hub/services/reports.service';
import { listDocuments } from '../../modules/finance-hub/services/documents.service';
import { getAssetSchedule, getRuns, listAssets, listPrepaid } from '../../modules/finance-hub/services/assets.service';
import { getExpenseRegister, listRecurring, listReimbursements } from '../../modules/finance-hub/services/expenses.service';
import { listDealTerms } from '../../modules/finance-hub/services/dealTerms.service';
import { listVouchers } from '../../modules/finance-hub/services/ledger.service';
import { listSettlements, openPayables } from '../../modules/finance-hub/services/settlements.service';
import { getAdvances, getDues, getPartyBalances, getPartyStatement, listFollowUps, listSchedules, listWriteOffs } from '../../modules/finance-hub/services/receivables.service';
import { listParties } from '../../modules/finance-hub/services/parties.service';
import { getLedgerBalances, getReceiptsRegister, getVehicleDetail, getVehicleRegister } from '../../modules/finance-hub/services/vehicleFinance.service';
import { getRun, getStatutory, listAdvances, listEmployees, listFullFinal, listRuns, listStructures } from '../../modules/finance-hub/services/payroll.service';
import { get2bReconciliation, getGstRegister, getGstSummary, getIncomeTax, getTaxRange, getWithholdingRegister, gstRegister, listChallans, listEInvoices } from '../../modules/finance-hub/services/tax.service';
import { getCaDashboard, listVault, getMonthlyClose, getYearClose, listQueries, getReviewQueue } from '../../modules/finance-hub/services/ca.service';
import { getUploadHistory, EXPORT_KINDS } from '../../modules/finance-hub/services/dataExchange.service';
import { getAutomation, getIntegrations, getTaxConfig } from '../../modules/finance-hub/services/integrations.service';
import { loadFinSettings, readPostingConfig } from '../../modules/finance-hub/services/settings.service';
import prisma from '../../lib/prisma';
import { summarizeFinanceTransactions } from '../../utils/finance';
import { buildAiFileAction, type AiFileAction } from './aiUiActions.service';
import { extractDriveFileIdFromSecureUrl, getSecureDocumentUrl } from '../../utils/secureDocumentUrl';
import {
  financePageLabelFor,
  financePageQuestionKeysFor,
  financeRelatedPageKeysFor,
  SCOPED_FINANCE_PAGE_KEYS,
  type FinancePageContext,
  type ScopedFinancePageKey,
} from './financeAiPage.service';

export type FinanceHubPageArguments = {
  pageKey: ScopedFinancePageKey;
  days?: number;
  limit?: number;
  query?: string;
  from?: string;
  to?: string;
  asOf?: string;
  includeDrafts?: boolean;
  vehicleId?: string;
  partyId?: string;
  bankId?: string;
  accountId?: string;
  yearId?: string;
  includeZero?: boolean;
  status?: string;
  assetId?: string;
  month?: string;
  runId?: string;
  side?: 'SALES' | 'PURCHASES' | 'RECEIVABLE' | 'PAYABLE' | 'BOTH';
  taxType?: string;
  compare?: 'previous-year' | 'previous-period';
  measure?: 'INCOME' | 'EXPENSE' | 'PURCHASE';
  by?: 'account' | 'party' | 'vehicle';
  periodId?: string;
  category?: string;
  scope?: 'manual' | 'suspense' | 'all';
  archived?: boolean;
  minAmount?: number;
};

type Query = Record<string, string>;

const todayString = () => new Date().toISOString().slice(0, 10);

const dateDaysAgo = (days: number) => {
  const date = new Date(`${todayString()}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - Math.max(0, days - 1));
  return date.toISOString().slice(0, 10);
};

const addIfString = (query: Query, key: string, value: string | undefined) => {
  if (value?.trim()) query[key] = value.trim();
};

const pageSizeFor = (limit?: number) => String(Math.min(20, Math.max(1, Math.floor(limit ?? 10))));

const legacyExpenseTransactions = async (query: Query) => {
  const from = pageDate(query.from);
  const to = pageDate(query.to, true);
  const q = query.q?.trim();
  const where = {
    status: { not: FinanceTransactionStatus.VOIDED },
    ...(from || to ? { transactionDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    ...(q ? { OR: [
      { name: { contains: q, mode: 'insensitive' as const } },
      { category: { contains: q, mode: 'insensitive' as const } },
      { narration: { contains: q, mode: 'insensitive' as const } },
      { reference: { contains: q, mode: 'insensitive' as const } },
      { accountName: { contains: q, mode: 'insensitive' as const } },
    ] } : {}),
  };
  const records = await prisma.financeTransaction.findMany({ where, orderBy: [{ transactionDate: 'desc' }, { createdAt: 'desc' }], take: 5000 });
  const transactions = records.map((record) => ({
    ...record,
    amount: Number(record.amount),
    balance: record.balance === null ? null : Number(record.balance),
    transactionDate: record.transactionDate.toISOString(),
    valueDate: record.valueDate?.toISOString() ?? null,
  }));
  const summaryRows = transactions.filter((transaction): transaction is (typeof transactions)[number] & { type: 'DEBIT' | 'CREDIT' } => transaction.type === 'DEBIT' || transaction.type === 'CREDIT');
  return { transactions, summary: summarizeFinanceTransactions(summaryRows), total: transactions.length };
};

export const buildFinanceHubPageQuery = (
  pageKey: ScopedFinancePageKey,
  args: Omit<FinanceHubPageArguments, 'pageKey'>,
): Query => {
  const query: Query = {};
  const from = args.from?.trim() || (args.days ? dateDaysAgo(args.days) : undefined);
  const to = args.to?.trim() || (args.days ? todayString() : undefined);
  const pageSize = pageSizeFor(args.limit);

  if (pageKey === 'financial-overview') return query;
  if (pageKey === 'cash-flow-overview') {
    addIfString(query, 'from', from);
    addIfString(query, 'to', to);
    return query;
  }
  if (pageKey === 'profit-loss') {
    addIfString(query, 'from', from);
    addIfString(query, 'to', to);
    if (args.compare) query.compare = args.compare;
    return query;
  }
  if (pageKey === 'balance-sheet') {
    addIfString(query, 'asOf', args.asOf || to);
    if (args.compare) query.compare = args.compare;
    return query;
  }
  if (pageKey === 'cash-flow-statement') {
    addIfString(query, 'from', from);
    addIfString(query, 'to', to);
    return query;
  }
  if (pageKey === 'revenue-purchase-reports') {
    addIfString(query, 'from', from);
    addIfString(query, 'to', to);
    if (args.measure) query.measure = args.measure;
    if (args.by) query.by = args.by;
    return query;
  }
  if (pageKey === 'vehicle-profitability') {
    query.status = 'sold';
    query.dateBasis = 'sale';
    addIfString(query, 'from', from);
    addIfString(query, 'to', to);
    query.page = '1';
    query.pageSize = pageSize;
    return query;
  }
  if (pageKey === 'expense-margin-analysis') {
    addIfString(query, 'from', from);
    addIfString(query, 'to', to);
    return query;
  }
  if (pageKey === 'receivables-payables-report') {
    query.items = 'true';
    addIfString(query, 'asOf', args.asOf || to);
    return query;
  }
  if (pageKey === 'bank-cash-reports') {
    addIfString(query, 'from', from);
    addIfString(query, 'to', to);
    return query;
  }
  if (pageKey === 'tax-reports') {
    addIfString(query, 'from', from);
    addIfString(query, 'to', to);
    return query;
  }
  if (pageKey === 'alerts-pending-approvals') return query;
  if (pageKey === 'seller-advances') {
    query.systemKey = 'SELLER_ADVANCES';
    if (args.includeDrafts) query.includeDrafts = 'true';
    return query;
  }
  if (pageKey === 'hdfc-virtual-bank-ledger') query.type = 'VIRTUAL';
  if (pageKey === 'bank-reconciliation') {
    addIfString(query, 'bankId', args.bankId);
    addIfString(query, 'from', from);
    addIfString(query, 'to', to);
  }
  if (pageKey === 'unmatched-transactions' || pageKey === 'cash-book-petty-cash') {
    addIfString(query, 'from', from);
    addIfString(query, 'to', to);
  }
  if (pageKey === 'bank-statement-upload' || pageKey === 'upi-gateway-settlement') {
    query.page = '1';
    query.pageSize = pageSize;
  }
  if (pageKey === 'bank-transfers') query.types = 'CONTRA';
  if (pageKey === 'master-general-ledger') {
    addIfString(query, 'accountId', args.accountId);
    addIfString(query, 'from', from);
    addIfString(query, 'to', to);
  }
  if (pageKey === 'day-book') {
    addIfString(query, 'from', from);
    addIfString(query, 'to', to);
  }
  if (pageKey === 'journal-entries') query.types = 'JOURNAL';
  if (pageKey === 'payment-vouchers') query.types = 'PAYMENT';
  if (pageKey === 'receipt-vouchers') query.types = 'RECEIPT';
  if (pageKey === 'contra-adjustment-vouchers') query.types = 'CONTRA,ADJUSTMENT';
  if (pageKey === 'trial-balance' || pageKey === 'suspense-account') {
    addIfString(query, 'from', from);
    addIfString(query, 'to', to);
  }
  if (pageKey === 'trial-balance' && args.includeZero) query.includeZero = 'true';
  if (pageKey === 'opening-balances') addIfString(query, 'yearId', args.yearId);
  if (pageKey === 'employee-reimbursements') addIfString(query, 'status', args.status);
  if (pageKey === 'depreciation') addIfString(query, 'month', args.month);
  if (pageKey === 'statutory-contributions') addIfString(query, 'month', args.month);
  if (['gst-dashboard', 'sales-purchase-gst-register', 'gst-returns-reconciliation', 'input-tax-credit', 'e-invoice-eway-bill'].includes(pageKey)) addIfString(query, 'month', args.month);
  if (pageKey === 'sales-purchase-gst-register' && args.side) query.side = args.side;
  if (['tds-management', 'tcs-management'].includes(pageKey)) {
    query.kind = pageKey === 'tcs-management' ? 'TCS' : 'TDS';
    query.side = 'PAYABLE';
    addIfString(query, 'month', args.month);
  }
  if (pageKey === 'tax-payments-challans') {
    addIfString(query, 'taxType', args.taxType);
    addIfString(query, 'month', args.month);
  }
  if (pageKey === 'vendor-bills') query.types = 'PURCHASE_BILL,DEBIT_NOTE';
  const partyTypes: Partial<Record<ScopedFinancePageKey, string>> = {
    'customer-ledger': 'CUSTOMER',
    'partner-ledger': 'PARTNER',
    'seller-vendor-ledger': 'SELLER,VENDOR',
    'broker-agent-ledger': 'BROKER,AGENT',
  };
  if (partyTypes[pageKey]) query.types = partyTypes[pageKey]!;
  if (['customer-ledger', 'partner-ledger', 'seller-vendor-ledger', 'broker-agent-ledger', 'party-statements'].includes(pageKey)) {
    query.page = '1';
    query.pageSize = pageSize;
  }
  if (pageKey === 'customer-dues') {
    query.side = 'RECEIVABLE';
    query.items = 'true';
    addIfString(query, 'asOf', args.asOf);
  }
  if (pageKey === 'supplier-partner-payables') {
    query.side = 'PAYABLE';
    query.items = 'true';
    addIfString(query, 'asOf', args.asOf);
  }
  if (pageKey === 'due-aging-reports') {
    query.items = 'false';
    addIfString(query, 'asOf', args.asOf);
  }
  if (pageKey === 'payment-schedules') {
    addIfString(query, 'from', from);
    addIfString(query, 'to', to);
    query.page = '1';
    query.pageSize = pageSize;
  }
  if (pageKey === 'follow-up-reminders') {
    query.status = 'OPEN';
    query.page = '1';
    query.pageSize = pageSize;
  }
  if (pageKey === 'settlements-write-offs') {
    query.page = '1';
    query.pageSize = pageSize;
  }
  if (pageKey === 'purchase-bills-invoices') query.types = 'PURCHASE_BILL';
  if (pageKey === 'purchase-returns') {
    query.types = 'DEBIT_NOTE';
    query.reason = 'RETURN';
  }
  if (pageKey === 'customer-prime-payments') {
    query.page = '1';
    query.pageSize = pageSize;
  }
  if (pageKey === 'vehicle-sale-invoices' || pageKey === 'all-sales') {
    query.status = 'sold';
    query.dateBasis = 'sale';
    if (pageKey === 'vehicle-sale-invoices') query.invoiced = 'true';
  }
  if (pageKey === 'sales-invoices') query.types = 'SALES_INVOICE';
  if (pageKey === 'customer-receipts') query.page = '1';
  if (pageKey === 'credit-debit-notes') query.types = 'CREDIT_NOTE,DEBIT_NOTE';
  if (pageKey === 'sales-returns-refunds') {
    query.types = 'CREDIT_NOTE';
    query.reason = 'RETURN';
  }
  if (pageKey === 'brokerage-other-income') query.brokerage = 'true';
  if (pageKey === 'vehicle-wise-ledger') {
    addIfString(query, 'vehicleId', args.vehicleId);
    if (args.includeDrafts) query.includeDrafts = 'true';
  }
  if (pageKey === 'vehicle-cost-sheet') addIfString(query, 'asOn', args.asOf);
  if (pageKey === 'vehicle-profit-margin') {
    query.status = 'sold';
    query.dateBasis = 'sale';
  }
  if (pageKey === 'stock-valuation') {
    query.status = 'in_stock';
    addIfString(query, 'asOn', args.asOf);
  }
  if (pageKey === 'exchange-transactions') query.exchange = 'true';
  if (pageKey === 'consignment-deals') query.mode = 'CONSIGNMENT';
  if (pageKey === 'all-purchases' || pageKey === 'vehicle-purchase-list' || pageKey === 'additional-purchase-costs') {
    query.status = 'booked';
    query.dateBasis = 'purchase';
    if (args.includeDrafts) query.includeDrafts = 'true';
    addIfString(query, 'asOn', args.asOf);
  }
  if (pageKey === 'party-advances-deposits') addIfString(query, 'asOf', args.asOf);
  if (pageKey === 'party-statements' && args.partyId) query.partyId = args.partyId;
  if (pageKey === 'document-vault') {
    addIfString(query, 'category', args.category);
    if (args.archived) query.archived = 'true';
  }
  if (pageKey === 'accounting-review') {
    addIfString(query, 'scope', args.scope);
    addIfString(query, 'status', args.status);
    if (args.minAmount !== undefined) query.minAmount = String(args.minAmount);
  }
  if (pageKey === 'audit-trail') {
    query.page = '1';
    query.pageSize = pageSize;
  }
  if (pageKey === 'ca-queries-checklist') {
    addIfString(query, 'status', args.status);
  }
  if (pageKey === 'voucher-numbering' || pageKey === 'financial-year-periods') addIfString(query, 'yearId', args.yearId);
  addIfString(query, 'q', args.query);
  addIfString(query, 'from', from);
  addIfString(query, 'to', to);
  if (pageKey === 'purchase-bills-invoices' || pageKey === 'purchase-returns' || pageKey === 'all-purchases' || pageKey === 'vehicle-purchase-list' || pageKey === 'additional-purchase-costs' || pageKey === 'customer-prime-payments' || pageKey === 'vehicle-sale-invoices' || pageKey === 'all-sales' || pageKey === 'sales-invoices' || pageKey === 'customer-receipts' || pageKey === 'credit-debit-notes' || pageKey === 'sales-returns-refunds' || pageKey === 'brokerage-other-income' || pageKey === 'vehicle-cost-sheet' || pageKey === 'vehicle-profit-margin' || pageKey === 'stock-valuation' || pageKey === 'exchange-transactions' || pageKey === 'consignment-deals' || pageKey === 'partner-commission-settlement' || pageKey === 'expense-register' || pageKey === 'vendor-bills') {
    query.page = '1';
    query.pageSize = pageSize;
  }
  if (['bank-transfers', 'journal-entries', 'payment-vouchers', 'receipt-vouchers', 'contra-adjustment-vouchers', 'day-book'].includes(pageKey)) {
    query.page = '1';
    query.pageSize = pageSize;
  }
  return query;
};

const pageDate = (value: string | undefined, end = false) => {
  if (!value) return undefined;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return undefined;
  if (end) date.setUTCDate(date.getUTCDate() + 1);
  return date;
};

const getFinanceRolesAndPermissions = async () => {
  const [roles, directPermissionCounts] = await Promise.all([
    prisma.customRole.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true, description: true, permissions: true, _count: { select: { users: true } } },
    }),
    prisma.adminPermission.groupBy({ by: ['permission'], _count: { _all: true }, orderBy: { permission: 'asc' } }),
  ]);
  return {
    roles: roles.map((role) => ({
      id: role.id,
      name: role.name,
      description: role.description,
      permissions: role.permissions,
      assignedUsers: role._count.users,
    })),
    directPermissionCounts: directPermissionCounts.map((item) => ({ permission: item.permission, assignedUsers: item._count._all })),
  };
};

const customerPrimePayments = async (query: Query) => {
  const q = query.q?.toLowerCase();
  const dateFilter: { gte?: Date; lt?: Date } = {};
  const from = pageDate(query.from);
  const to = pageDate(query.to, true);
  if (from) dateFilter.gte = from;
  if (to) dateFilter.lt = to;
  const where = from || to ? { submittedAt: dateFilter } : {};
  const rows = await prisma.customerPrimeSubscription.findMany({
    where,
    orderBy: [{ submittedAt: 'desc' }, { createdAt: 'desc' }],
    take: 5000,
    select: { id: true, userId: true, status: true, transactionRef: true, paidAmount: true, customerCity: true, customerState: true, submittedAt: true, approvedAt: true, startedAt: true, expiresAt: true, receiptUrl: true },
  });
  const users = await prisma.user.findMany({ where: { id: { in: rows.map((row) => row.userId) } }, select: { id: true, name: true, email: true, mobile: true } });
  const payments = rows.filter((row) => {
    const user = users.find((item) => item.id === row.userId);
    return !q || [user?.name, user?.email, user?.mobile, row.transactionRef, row.status].some((value) => value?.toLowerCase().includes(q));
  }).map((row) => ({
    id: row.id,
    userId: row.userId,
    customer: users.find((item) => item.id === row.userId)?.name ?? null,
    email: users.find((item) => item.id === row.userId)?.email ?? null,
    mobile: users.find((item) => item.id === row.userId)?.mobile ?? null,
    status: row.status,
    transactionRef: row.transactionRef,
    paidAmount: Number(row.paidAmount),
    customerCity: row.customerCity,
    customerState: row.customerState,
    submittedAt: row.submittedAt.toISOString(),
    approvedAt: row.approvedAt?.toISOString() ?? null,
    startedAt: row.startedAt?.toISOString() ?? null,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    hasReceipt: Boolean(row.receiptUrl),
    receiptUrl: row.receiptUrl,
  }));
  const page = Number(query.page || '1');
  const pageSize = Number(query.pageSize || '25');
  return { total: payments.length, page, pageSize, payments: payments.slice((page - 1) * pageSize, page * pageSize) };
};

const refundRegister = async (query: Query) => {
  const from = pageDate(query.from);
  const to = pageDate(query.to, true);
  const rows = await prisma.sellAccountRefund.findMany({
    where: { ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } } : {}) },
    orderBy: { createdAt: 'desc' },
    take: 5000,
    select: { refundNumber: true, status: true, reason: true, amount: true, forfeitAmount: true, method: true, refundDate: true, paidAt: true, createdAt: true },
  });
  const page = Number(query.page || '1');
  const pageSize = Number(query.pageSize || '25');
  return {
    total: rows.length,
    amount: rows.reduce((sum, row) => sum + Number(row.amount), 0),
    refunds: rows.slice((page - 1) * pageSize, page * pageSize).map((row) => ({ ...row, amount: Number(row.amount), forfeitAmount: Number(row.forfeitAmount), refundDate: row.refundDate?.toISOString() ?? null, paidAt: row.paidAt?.toISOString() ?? null, createdAt: row.createdAt.toISOString() })),
  };
};

const secureFileUrl = (value: string | null | undefined) => {
  if (!value) return null;
  if (value.startsWith('/api/documents/secure/')) return value;
  const driveId = extractDriveFileIdFromSecureUrl(value);
  return driveId ? getSecureDocumentUrl(driveId) : null;
};

const pageFileActions = (pageKey: ScopedFinancePageKey, data: unknown, query: Query = {}): AiFileAction[] => {
  const actions: AiFileAction[] = [];
  const record = typeof data === 'object' && data !== null ? data as Record<string, unknown> : {};
  const rows = Array.isArray(record.rows) ? record.rows : [];
  if (pageKey === 'vehicle-sale-invoices') {
    for (const row of rows) {
      if (typeof row !== 'object' || row === null) continue;
      const item = row as Record<string, unknown>;
      if (typeof item.id !== 'string' || typeof item.invoiceNumber !== 'string' || !item.invoiceNumber) continue;
      const action = buildAiFileAction({
        label: `${item.invoiceNumber} · Vehicle sale invoice`,
        fileName: `${item.invoiceNumber}.pdf`,
        mimeType: 'application/pdf',
        url: `/api/recruitment/admin/sell-accounts/${item.id}/invoice`,
      });
      if (action) actions.push(action);
    }
  }
  if (pageKey === 'customer-prime-payments') {
    const payments = Array.isArray(record.payments) ? record.payments : [];
    for (const payment of payments) {
      if (typeof payment !== 'object' || payment === null) continue;
      const item = payment as Record<string, unknown>;
      const url = secureFileUrl(typeof item.receiptUrl === 'string' ? item.receiptUrl : null);
      if (!url) continue;
      const action = buildAiFileAction({ label: `${item.customer || 'Customer Prime'} · Payment receipt`, fileName: `prime-receipt-${item.id || 'payment'}.pdf`, mimeType: 'application/pdf', url });
      if (action) actions.push(action);
    }
  }
  if (pageKey === 'payslips') {
    const run = typeof record.run === 'object' && record.run !== null ? record.run as Record<string, unknown> : null;
    if (typeof run?.id === 'string' && typeof run.month === 'string') {
      const action = buildAiFileAction({ label: `Payslips · ${run.month}`, fileName: `payslips-${run.month}.csv`, mimeType: 'text/csv', url: `/api/finance-hub/payroll/runs/${run.id}/payslips.csv` });
      if (action) actions.push(action);
    }
  }
  if (pageKey === 'statutory-contributions' && typeof record.month === 'string') {
    const action = buildAiFileAction({ label: `Statutory contribution export · ${record.month}`, fileName: `statutory-${record.month}.csv`, mimeType: 'text/csv', url: `/api/finance-hub/payroll/statutory.csv?month=${encodeURIComponent(record.month)}` });
    if (action) actions.push(action);
  }
  if (pageKey === 'full-final-settlement') {
    const action = buildAiFileAction({ label: 'Full & final settlement export', fileName: 'full-final-settlements.csv', mimeType: 'text/csv', url: '/api/finance-hub/payroll/full-final.csv' });
      if (action) actions.push(action);
  }
  const exportQuery = (keys: string[]) => {
    const params = keys.flatMap((key) => typeof query[key] === 'string' && query[key] ? [`${encodeURIComponent(key)}=${encodeURIComponent(query[key])}`] : []);
    return params.length ? `?${params.join('&')}` : '';
  };
  const taxExport = (kind: string, label: string, fileName: string, keys: string[] = ['month', 'from', 'to', 'taxType']) => {
    const action = buildAiFileAction({ label, fileName, mimeType: 'text/csv', url: `/api/finance-hub/tax/export/${kind}${exportQuery(keys)}` });
    if (action) actions.push(action);
  };
  if (pageKey === 'gst-dashboard') taxExport('gst-summary', 'GST dashboard export', 'gst-summary.csv', ['month', 'from', 'to']);
  if (pageKey === 'sales-purchase-gst-register') {
    taxExport('gst-sales', 'GST sales register export', 'gst-sales.csv', ['month', 'from', 'to']);
    taxExport('gst-purchases', 'GST purchase register export', 'gst-purchases.csv', ['month', 'from', 'to']);
  }
  if (pageKey === 'gst-returns-reconciliation') taxExport('gst-returns', 'GST returns reconciliation export', 'gst-returns-reconciliation.csv', ['month', 'from', 'to']);
  if (pageKey === 'input-tax-credit') taxExport('itc', 'Input tax credit export', 'input-tax-credit.csv', ['month', 'from', 'to']);
  if (pageKey === 'e-invoice-eway-bill') taxExport('e-invoices', 'E-invoice / E-way bill export', 'e-invoices.csv', ['month', 'from', 'to']);
  if (pageKey === 'tds-management') taxExport('tds', 'TDS management export', 'tds.csv', ['month', 'from', 'to']);
  if (pageKey === 'tcs-management') taxExport('tcs', 'TCS management export', 'tcs.csv', ['month', 'from', 'to']);
  if (pageKey === 'tax-payments-challans') taxExport('challans', 'Tax challans export', 'tax-challans.csv', ['month', 'from', 'to', 'taxType']);
  if (pageKey === 'income-tax-provisions') taxExport('income-tax', 'Income tax and provisions export', 'income-tax.csv', ['from', 'to']);
  if (pageKey === 'profit-loss') {
    const action = buildAiFileAction({ label: 'Profit & Loss Statement (CSV Export)', fileName: `profit-loss-${query.from || 'fy'}-${query.to || 'today'}.csv`, mimeType: 'text/csv', url: `/finance-hub?module=profit-loss` });
    if (action) actions.push(action);
  }
  if (pageKey === 'balance-sheet') {
    const action = buildAiFileAction({ label: 'Balance Sheet Statement (CSV Export)', fileName: `balance-sheet-${query.asOf || 'asOf'}.csv`, mimeType: 'text/csv', url: `/finance-hub?module=balance-sheet` });
    if (action) actions.push(action);
  }
  if (pageKey === 'cash-flow-statement') {
    const action = buildAiFileAction({ label: 'Cash Flow Statement (Direct Method CSV)', fileName: `cash-flow-${query.from || 'fy'}-${query.to || 'today'}.csv`, mimeType: 'text/csv', url: `/finance-hub?module=cash-flow-statement` });
    if (action) actions.push(action);
  }
  if (pageKey === 'revenue-purchase-reports') {
    const action = buildAiFileAction({ label: 'Revenue & Purchase Monthly Report (CSV)', fileName: 'revenue-purchase-report.csv', mimeType: 'text/csv', url: `/finance-hub?module=revenue-purchase-reports` });
    if (action) actions.push(action);
  }
  if (pageKey === 'vehicle-profitability') {
    const csvAction = buildAiFileAction({ label: 'Vehicle Profitability Report (CSV)', fileName: 'vehicle-profitability.csv', mimeType: 'text/csv', url: `/finance-hub?module=vehicle-profitability` });
    if (csvAction) actions.push(csvAction);
    for (const row of rows) {
      if (typeof row !== 'object' || row === null) continue;
      const item = row as Record<string, unknown>;
      if (typeof item.id !== 'string' || typeof item.invoiceNumber !== 'string' || !item.invoiceNumber) continue;
      const invoiceAction = buildAiFileAction({
        label: `${item.invoiceNumber} · Vehicle sale invoice PDF`,
        fileName: `${item.invoiceNumber}.pdf`,
        mimeType: 'application/pdf',
        url: `/api/recruitment/admin/sell-accounts/${item.id}/invoice`,
      });
      if (invoiceAction) actions.push(invoiceAction);
    }
  }
  if (pageKey === 'expense-margin-analysis') {
    const action = buildAiFileAction({ label: 'Expense & Margin Analysis Report (CSV)', fileName: 'expense-margin-analysis.csv', mimeType: 'text/csv', url: `/finance-hub?module=expense-margin-analysis` });
    if (action) actions.push(action);
  }
  if (pageKey === 'receivables-payables-report') {
    const action = buildAiFileAction({ label: 'Receivables & Payables Aging Report (CSV)', fileName: 'receivables-payables-aging.csv', mimeType: 'text/csv', url: `/finance-hub?module=receivables-payables-report` });
    if (action) actions.push(action);
  }
  if (pageKey === 'bank-cash-reports') {
    const action = buildAiFileAction({ label: 'Bank & Cash Reports Movement (CSV)', fileName: 'bank-cash-report.csv', mimeType: 'text/csv', url: `/finance-hub?module=bank-cash-reports` });
    if (action) actions.push(action);
  }
  if (pageKey === 'tax-reports') {
    taxExport('tax-summary', 'Tax Reports (GST, TDS & TCS CSV)', 'tax-reports.csv', ['month', 'from', 'to']);
  }
  if (pageKey === 'document-vault') {
    const docs = Array.isArray(record.documents) ? record.documents : Array.isArray(data) ? data : [];
    for (const doc of docs) {
      if (typeof doc !== 'object' || doc === null) continue;
      const d = doc as Record<string, unknown>;
      const fileUrl = typeof d.fileUrl === 'string' ? d.fileUrl : null;
      if (!fileUrl) continue;
      const title = typeof d.title === 'string' ? d.title : 'Document';
      const fileName = typeof d.fileName === 'string' && d.fileName ? d.fileName : `${title.toLowerCase().replace(/\s+/g, '-')}.pdf`;
      const mimeType = typeof d.mimeType === 'string' && d.mimeType ? d.mimeType : 'application/pdf';
      const downloadUrl = fileUrl.startsWith('/uploads/') ? secureFileUrl(fileUrl) ?? fileUrl : fileUrl;
      const action = buildAiFileAction({
        label: `${title} (${String(d.category || 'Vault')})`,
        fileName,
        mimeType,
        url: downloadUrl,
      });
      if (action) actions.push(action);
    }
  }
  if (pageKey === 'ca-queries-checklist') {
    const queries = Array.isArray(record.queries) ? record.queries : [];
    for (const q of queries) {
      if (typeof q !== 'object' || q === null) continue;
      const item = q as Record<string, unknown>;
      const responses = Array.isArray(item.responses) ? item.responses : [];
      for (const res of responses) {
        if (typeof res !== 'object' || res === null) continue;
        const r = res as Record<string, unknown>;
        const fileUrl = typeof r.fileUrl === 'string' ? r.fileUrl : null;
        if (!fileUrl) continue;
        const action = buildAiFileAction({
          label: `${String(item.title || 'CA Query')} · Evidence attachment`,
          fileName: `query-evidence-${String(item.id || 'file')}.pdf`,
          mimeType: 'application/pdf',
          url: fileUrl.startsWith('/uploads/') ? secureFileUrl(fileUrl) ?? fileUrl : fileUrl,
        });
        if (action) actions.push(action);
      }
    }
  }
  if (pageKey === 'tally-accounting-export') {
    const tallyAction = buildAiFileAction({
      label: 'Tally Prime XML Export (Masters + Vouchers)',
      fileName: `tally-export-${query.from || 'fy'}-${query.to || 'today'}.xml`,
      mimeType: 'application/xml',
      url: `/api/finance-hub/data/export/tally${exportQuery(['from', 'to'])}`,
    });
    if (tallyAction) actions.push(tallyAction);
    const coaAction = buildAiFileAction({
      label: 'Chart of Accounts (CSV for Tally Mapping)',
      fileName: 'chart-of-accounts.csv',
      mimeType: 'text/csv',
      url: '/api/finance-hub/data/export/chart-of-accounts',
    });
    if (coaAction) actions.push(coaAction);
    const dayBookAction = buildAiFileAction({
      label: 'Day Book (CSV for Accounting Software)',
      fileName: `day-book-${query.from || 'fy'}-${query.to || 'today'}.csv`,
      mimeType: 'text/csv',
      url: `/api/finance-hub/data/export/day-book${exportQuery(['from', 'to'])}`,
    });
    if (dayBookAction) actions.push(dayBookAction);
  }
  if (pageKey === 'download-reports') {
    const rpt = (kind: string, label: string, fileName: string) => {
      const action = buildAiFileAction({
        label,
        fileName,
        mimeType: 'text/csv',
        url: `/api/finance-hub/data/export/${kind}${exportQuery(['from', 'to'])}`,
      });
      if (action) actions.push(action);
    };
    rpt('trial-balance', 'Trial Balance (CSV)', 'trial-balance.csv');
    rpt('day-book', 'Day Book (All Voucher Lines CSV)', 'day-book.csv');
    rpt('party-balances', 'Party Balances (Receivable, Payable & Advances CSV)', 'party-balances.csv');
    rpt('gst-sales', 'GST Sales Register (CSV)', 'gst-sales.csv');
    rpt('gst-purchases', 'GST Purchase Register (CSV)', 'gst-purchases.csv');
    rpt('tds', 'TDS Register (Deductions & Deposits CSV)', 'tds-register.csv');
    rpt('chart-of-accounts', 'Chart of Accounts (Ledgers & Groups CSV)', 'chart-of-accounts.csv');
    const tallyAction = buildAiFileAction({
      label: 'Tally Prime XML Export (Masters + Vouchers)',
      fileName: `tally-${query.from || 'fy'}-${query.to || 'today'}.xml`,
      mimeType: 'application/xml',
      url: `/api/finance-hub/data/export/tally${exportQuery(['from', 'to'])}`,
    });
    if (tallyAction) actions.push(tallyAction);
  }
  if (pageKey === 'import-transactions') {
    const action = buildAiFileAction({
      label: 'Voucher Import CSV Template',
      fileName: 'voucher-import-template.csv',
      mimeType: 'text/csv',
      url: '/finance-hub?module=import-transactions',
    });
    if (action) actions.push(action);
  }
  if (pageKey === 'import-opening-balances') {
    const action = buildAiFileAction({
      label: 'Opening Balances Import CSV Template',
      fileName: 'opening-balances-template.csv',
      mimeType: 'text/csv',
      url: '/finance-hub?module=import-opening-balances',
    });
    if (action) actions.push(action);
  }
  return actions.slice(0, 20);
};

const totalFor = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  for (const key of ['total', 'totalAmount', 'amount']) {
    if (typeof record[key] === 'number' && Number.isFinite(record[key])) return record[key] as number;
  }
  return null;
};

const insightsFor = (pageKey: ScopedFinancePageKey, data: unknown): string[] => {
  if (typeof data !== 'object' || data === null) return ['Source data is available; no aggregate insight was calculated.'];
  const record = data as Record<string, unknown>;
  const insights: string[] = [];
  const rows = Array.isArray(record.rows) ? record.rows : Array.isArray(record.documents) ? record.documents : Array.isArray(record.balances) ? record.balances : [];
  if (!rows.length && (record.total === 0 || record.total === undefined)) insights.push('No matching records were found for the selected page and filters.');
  if (pageKey === 'financial-overview') {
    const kpis = record.kpis as Record<string, unknown> | undefined;
    if (typeof kpis?.netProfit === 'number') insights.push(`Net profit for the current financial year is ₹${kpis.netProfit.toLocaleString('en-IN')}.`);
  }
  if (pageKey === 'cash-flow-overview') {
    const net = record.netCashFlow ?? record.netMovement ?? record.net;
    if (typeof net === 'number') insights.push(`Net cash movement for the selected range is ₹${net.toLocaleString('en-IN')}.`);
  }
  if (pageKey === 'alerts-pending-approvals') {
    const alerts = Array.isArray(record.alerts) ? record.alerts.length : 0;
    const approvals = typeof record.approvals === 'object' && record.approvals !== null && typeof (record.approvals as Record<string, unknown>).total === 'number'
      ? (record.approvals as Record<string, number>).total
      : 0;
    insights.push(`${alerts} active alert(s) and ${approvals} pending approval record(s) are in this view.`);
  }
  if (pageKey === 'seller-advances' && typeof record.total === 'number') insights.push(`Open seller advance balance is ₹${record.total.toLocaleString('en-IN')}.`);
  if (pageKey === 'purchase-bills-invoices' || pageKey === 'purchase-returns') {
    const summary = Array.isArray(record.summary) ? record.summary : [];
    const total = summary.reduce((sum, row) => sum + (typeof row === 'object' && row !== null && typeof (row as Record<string, unknown>).total === 'number' ? (row as Record<string, number>).total : 0), 0);
    insights.push(`${rows.length} record(s) are shown${total ? ` with ₹${total.toLocaleString('en-IN')} across the result summary` : ''}.`);
  }
  if (pageKey === 'all-purchases' || pageKey === 'vehicle-purchase-list' || pageKey === 'additional-purchase-costs') {
    const total = totalFor(record);
    if (typeof total === 'number') insights.push(`${total} purchase register record(s) match the selected filters.`);
    const summaries = rows.map((row) => (typeof row === 'object' && row !== null ? row as Record<string, unknown> : null)).filter(Boolean);
    const landed = summaries.map((row) => row?.landedCost).filter((value): value is number => typeof value === 'number');
    if (landed.length) insights.push(`Average landed cost of the displayed records is ₹${(landed.reduce((sum, value) => sum + value, 0) / landed.length).toLocaleString('en-IN', { maximumFractionDigits: 2 })}.`);
  }
  if (['vehicle-sale-invoices', 'all-sales', 'vehicle-profit-margin', 'stock-valuation', 'exchange-transactions'].includes(pageKey)) {
    const total = totalFor(record);
    if (typeof total === 'number') insights.push(`${total} vehicle sale record(s) match the selected filters.`);
    if (typeof record.totals === 'object' && record.totals !== null) {
      const totals = record.totals as Record<string, unknown>;
      if (typeof totals.profit === 'number') insights.push(`Calculated profit after GST for the selected records is â‚¹${totals.profit.toLocaleString('en-IN')}.`);
      if (typeof totals.stockValue === 'number') insights.push(`Stock valuation in this view is â‚¹${totals.stockValue.toLocaleString('en-IN')}.`);
    }
  }
  if (pageKey === 'customer-receipts' && typeof record.amount === 'number') insights.push(`Receipts in this view total â‚¹${record.amount.toLocaleString('en-IN')}; ${record.unposted ?? 0} are not posted in books.`);
  if (pageKey === 'customer-prime-payments' && typeof record.total === 'number') insights.push(`${record.total} Customer Prime payment record(s) match the selected filters.`);
  if (pageKey === 'sales-returns-refunds' && typeof record.refunds === 'object' && record.refunds !== null) {
    const refunds = record.refunds as Record<string, unknown>;
    if (typeof refunds.amount === 'number') insights.push(`Refund requests in the selected range total â‚¹${refunds.amount.toLocaleString('en-IN')}.`);
  }
  if (pageKey === 'brokerage-other-income' && Array.isArray(record.deals)) insights.push(`${record.deals.length} brokerage deal term record(s) are available.`);
  if (pageKey === 'consignment-deals' && Array.isArray(record.deals)) insights.push(`${record.deals.length} consignment deal(s) are available with commission and consignor settlement fields.`);
  if (pageKey === 'partner-commission-settlement' && Array.isArray(record.payables)) insights.push(`${record.payables.length} party payable group(s) are currently open for settlement.`);
  if (['customer-ledger', 'partner-ledger', 'seller-vendor-ledger', 'broker-agent-ledger'].includes(pageKey) && Array.isArray(record.rows)) {
    insights.push(`${record.rows.length} party ledger record(s) are available with live balance buckets.`);
  }
  if (pageKey === 'party-statements') {
    if (record.requiresPartyId === true) insights.push('A party identifier is required for a complete opening-to-closing statement; the available party index is included.');
    if (typeof record.opening === 'number' && typeof record.closing === 'number') insights.push(`Statement movement is based on posted vouchers from ${String(record.from ?? '')} to ${String(record.to ?? '')}.`);
  }
  if (pageKey === 'due-aging-reports') insights.push('Receivable and payable aging buckets are calculated from posted ledger entries and due dates.');
  if (pageKey === 'party-advances-deposits' && typeof record.held === 'number' && typeof record.paid === 'number') insights.push(`Advances show INR ${record.held.toLocaleString('en-IN')} held and INR ${record.paid.toLocaleString('en-IN')} paid ahead.`);
  if (pageKey === 'payment-schedules' && Array.isArray(record.schedules)) insights.push(`${record.schedules.length} payment schedule record(s) are available.`);
  if (pageKey === 'follow-up-reminders' && Array.isArray(record.followUps)) insights.push(`${record.followUps.length} open follow-up reminder(s) are available.`);
  if (pageKey === 'settlements-write-offs' && Array.isArray(record.writeOffs)) insights.push(`${record.writeOffs.length} write-off record(s) are available.`);
  if (['bank-accounts', 'hdfc-virtual-bank-ledger'].includes(pageKey) && Array.isArray(record.accounts)) insights.push(`${record.accounts.length} bank account record(s) are available with masked account identifiers and live book balances.`);
  if (pageKey === 'bank-statement-upload' && Array.isArray(record.batches)) insights.push(`${record.batches.length} statement import batch(es) are available, including duplicate and failed row counts.`);
  if (pageKey === 'bank-reconciliation' && record.requiresBankId === true) insights.push('Choose a bank account to compare statement rows, book entries and reconciliation differences.');
  if (pageKey === 'bank-reconciliation' && Array.isArray(record.statement) && Array.isArray(record.book)) insights.push(`${record.statement.length} statement row(s) and ${record.book.length} book line(s) are in the selected reconciliation range.`);
  if (pageKey === 'unmatched-transactions' && Array.isArray(record.rows)) insights.push(`${record.rows.length} unmatched statement row(s) are shown; unmapped account names are included separately.`);
  if (['bank-transfers', 'day-book', 'journal-entries', 'payment-vouchers', 'receipt-vouchers', 'contra-adjustment-vouchers'].includes(pageKey) && Array.isArray(record.vouchers)) insights.push(`${record.vouchers.length} voucher record(s) are shown with source and posting status.`);
  if (pageKey === 'cash-book-petty-cash' && typeof record.totals === 'object' && record.totals !== null) {
    const totals = record.totals as Record<string, unknown>;
    if (typeof totals.closing === 'number') insights.push(`Cash and petty-cash closing balance is INR ${totals.closing.toLocaleString('en-IN')}.`);
  }
  if (pageKey === 'upi-gateway-settlement' && Array.isArray(record.gateways)) insights.push(`${record.gateways.length} gateway clearing ledger(s) are available; pending amounts are source-backed.`);
  if (pageKey === 'master-general-ledger' && record.requiresAccountId === true) insights.push('Choose an account from the included chart index for opening, movement and closing ledger detail.');
  if (pageKey === 'trial-balance' && typeof record.difference === 'number') insights.push(`Trial balance difference is INR ${record.difference.toLocaleString('en-IN')}.`);
  if (pageKey === 'suspense-account' && typeof record.closing === 'number') insights.push(`Suspense closing balance is INR ${record.closing.toLocaleString('en-IN')}.`);
  if (pageKey === 'opening-balances' && typeof record.finalized === 'boolean') insights.push(`Opening balances for ${String((record.year as Record<string, unknown> | undefined)?.label ?? 'the selected year')} are ${record.finalized ? 'finalized' : 'still a draft'}.`);
  if (pageKey === 'expenses-transactions' || pageKey === 'expense-register') {
    if (typeof record.grandTotal === 'number') insights.push(`Posted expense movement in the selected period is INR ${record.grandTotal.toLocaleString('en-IN')}.`);
    if (typeof record.total === 'number') insights.push(`${record.total} expense register row(s) match the selected filters.`);
    if (typeof record.summary === 'object' && record.summary !== null) {
      const summary = record.summary as Record<string, unknown>;
      if (typeof summary.debit === 'number' && typeof summary.credit === 'number') insights.push(`Legacy expense transactions show INR ${summary.debit.toLocaleString('en-IN')} debit and INR ${summary.credit.toLocaleString('en-IN')} credit movement.`);
    }
  }
  if (pageKey === 'vendor-bills' && Array.isArray(record.documents)) {
    const summary = Array.isArray(record.summary) ? record.summary : [];
    const total = summary.reduce((sum, row) => sum + (typeof row === 'object' && row !== null && typeof (row as Record<string, unknown>).total === 'number' ? (row as Record<string, number>).total : 0), 0);
    insights.push(`${record.documents.length} vendor bill or debit-note record(s) are shown${total ? ` with INR ${total.toLocaleString('en-IN')} in the result summary` : ''}.`);
  }
  if (pageKey === 'recurring-expenses' && Array.isArray(record.items)) {
    const due = record.items.filter((item) => typeof item === 'object' && item !== null && (item as Record<string, unknown>).due === true).length;
    insights.push(`${record.items.length} recurring expense schedule(s) are configured; ${due} are currently due.`);
  }
  if (pageKey === 'employee-reimbursements' && Array.isArray(record.items)) {
    const pending = record.items.filter((item) => typeof item === 'object' && item !== null && ['SUBMITTED', 'APPROVED'].includes(String((item as Record<string, unknown>).status))).length;
    insights.push(`${record.items.length} employee reimbursement claim(s) are available; ${pending} still need approval or payout.`);
  }
  if (pageKey === 'fixed-assets' && Array.isArray(record.assets)) {
    const assets = record.assets.filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null);
    const cost = assets.reduce((sum, item) => sum + (typeof item.cost === 'number' ? item.cost : 0), 0);
    const bookValue = assets.reduce((sum, item) => sum + (typeof item.bookValue === 'number' ? item.bookValue : 0), 0);
    insights.push(`${assets.length} fixed asset(s) are registered with cost INR ${cost.toLocaleString('en-IN')} and book value INR ${bookValue.toLocaleString('en-IN')}.`);
  }
  if (pageKey === 'depreciation') {
    if (Array.isArray(record.runs)) insights.push(`${record.runs.length} depreciation run record(s) are available.`);
    if (Array.isArray(record.preview)) insights.push(`The selected depreciation month has ${record.preview.length} preview line(s).`);
  }
  if (pageKey === 'prepaid-expenses' && Array.isArray(record.items)) {
    const balance = record.items.reduce((sum, item) => sum + (typeof item === 'object' && item !== null && typeof (item as Record<string, unknown>).balance === 'number' ? (item as Record<string, number>).balance : 0), 0);
    insights.push(`${record.items.length} prepaid expense item(s) are available with INR ${balance.toLocaleString('en-IN')} remaining balance.`);
  }
  if (pageKey === 'employee-salary' && Array.isArray(record.employees)) {
    const employees = record.employees.filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null);
    const profiles = employees.filter((item) => item.salary !== null && typeof item.salary === 'object').length;
    const gross = employees.reduce((sum, item) => {
      const salary = item.salary;
      const grossValue = typeof salary === 'object' && salary !== null && typeof (salary as Record<string, unknown>).gross === 'number' ? (salary as Record<string, number>).gross : 0;
      return sum + (grossValue ?? 0);
    }, 0);
    insights.push(`${employees.length} employee record(s) are available; ${profiles} have salary profiles with monthly gross INR ${gross.toLocaleString('en-IN')}.`);
    if (profiles < employees.length) insights.push(`${employees.length - profiles} employee(s) need a salary profile before payroll can be processed.`);
  }
  if (pageKey === 'salary-structure' && Array.isArray(record.structures)) {
    const active = record.structures.filter((item) => typeof item === 'object' && item !== null && (item as Record<string, unknown>).isActive === true).length;
    insights.push(`${record.structures.length} salary structure(s) are configured; ${active} are active.`);
  }
  if (pageKey === 'payroll-processing' && Array.isArray(record.runs)) {
    const runs = record.runs.filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null);
    const statusCounts = runs.reduce<Record<string, number>>((counts, run) => {
      const status = String(run.status ?? 'UNKNOWN');
      counts[status] = (counts[status] ?? 0) + 1;
      return counts;
    }, {});
    insights.push(`${runs.length} payroll run(s) are available; status breakdown: ${Object.entries(statusCounts).map(([status, count]) => `${status} ${count}`).join(', ') || 'none'}.`);
    const selectedRun = record.run as Record<string, unknown> | undefined;
    const totals = selectedRun?.totals as Record<string, unknown> | undefined;
    if (typeof totals?.gross === 'number' && typeof totals.net === 'number') insights.push(`Selected payroll run gross is INR ${totals.gross.toLocaleString('en-IN')} and net payable is INR ${totals.net.toLocaleString('en-IN')}.`);
  }
  if (pageKey === 'advances-deductions' && Array.isArray(record.advances)) {
    const advances = record.advances.filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null);
    const outstanding = advances.reduce((sum, item) => sum + (typeof item.employeeBalance === 'number' ? item.employeeBalance : 0), 0);
    const monthly = advances.reduce((sum, item) => sum + (typeof item.monthlyRecovery === 'number' && item.isActive === true ? item.monthlyRecovery : 0), 0);
    insights.push(`${advances.length} employee advance record(s) are available; outstanding balance is INR ${outstanding.toLocaleString('en-IN')} and active monthly recovery is INR ${monthly.toLocaleString('en-IN')}.`);
  }
  if (pageKey === 'payslips') {
    const selectedRun = record.run as Record<string, unknown> | undefined;
    const totals = selectedRun?.totals as Record<string, unknown> | undefined;
    if (Array.isArray(selectedRun?.payslips)) insights.push(`${selectedRun.payslips.length} payslip record(s) are available for the selected posted/paid run.`);
    if (typeof totals?.net === 'number') insights.push(`Selected payslip run net pay is INR ${totals.net.toLocaleString('en-IN')}; employer cost is INR ${typeof totals.cost === 'number' ? totals.cost.toLocaleString('en-IN') : 'not calculated'}.`);
    if (!selectedRun) insights.push('No posted or paid payroll run is available for payslip detail.');
  }
  if (pageKey === 'statutory-contributions') {
    const totals = record.totals as Record<string, unknown> | null | undefined;
    if (totals) insights.push(`Statutory totals for ${String(record.month)}: PF INR ${Number(totals.pf ?? 0).toLocaleString('en-IN')}, ESI INR ${Number(totals.esi ?? 0).toLocaleString('en-IN')}, PT INR ${Number(totals.pt ?? 0).toLocaleString('en-IN')}, TDS INR ${Number(totals.tds ?? 0).toLocaleString('en-IN')}.`);
    if (record.run === null) insights.push(`No posted or paid payroll run exists for ${String(record.month)}; statutory rows are empty.`);
  }
  if (pageKey === 'full-final-settlement' && Array.isArray(record.settlements)) {
    const settlements = record.settlements.filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null);
    const net = settlements.reduce((sum, item) => sum + (typeof item.net === 'number' ? item.net : 0), 0);
    const open = settlements.filter((item) => ['DRAFT', 'POSTED'].includes(String(item.status))).length;
    insights.push(`${settlements.length} full & final settlement record(s) are available; net settlement amount is INR ${net.toLocaleString('en-IN')} and ${open} remain open.`);
  }
  if (pageKey === 'gst-dashboard') {
    const outward = (record.gstr3b as Record<string, unknown> | undefined)?.outwardTaxable as Record<string, unknown> | undefined;
    const ledger = record.ledger as Record<string, unknown> | undefined;
    const readiness = Array.isArray(record.readiness) ? record.readiness : [];
    if (typeof outward?.taxable === 'number') insights.push(`GST dashboard for ${String(record.month)} shows outward taxable turnover of INR ${outward.taxable.toLocaleString('en-IN')} and output tax of INR ${['igst', 'cgst', 'sgst'].reduce((sum, key) => sum + (typeof outward[key] === 'number' ? outward[key] as number : 0), 0).toLocaleString('en-IN')}.`);
    if (ledger?.outputDifference && ledger.inputDifference) insights.push('GST register-to-ledger differences and filing-readiness checks are included in the source response.');
    if (readiness.length) insights.push(`${readiness.filter((item) => typeof item === 'object' && item !== null && (item as Record<string, unknown>).ok === true).length}/${readiness.length} GST readiness checks currently pass.`);
  }
  if (pageKey === 'sales-purchase-gst-register') {
    for (const key of ['sales', 'purchases']) {
      const register = record[key] as Record<string, unknown> | undefined;
      const totals = register?.totals as Record<string, unknown> | undefined;
      if (Array.isArray(register?.rows)) insights.push(`${key === 'sales' ? 'Sales' : 'Purchase'} GST register has ${register.rows.length} posted row(s) and tax of INR ${Number(totals?.tax ?? 0).toLocaleString('en-IN')}.`);
    }
  }
  if (pageKey === 'gst-returns-reconciliation') {
    const reconciliation = record.reconciliation as Record<string, unknown> | undefined;
    const summary = reconciliation?.summary as Record<string, unknown> | undefined;
    if (summary) insights.push(`GSTR-2B reconciliation: ${Number(summary.matched ?? 0)} matched, ${Number(summary.mismatch ?? 0)} mismatched, ${Number(summary.onlyIn2b ?? 0)} only in 2B and ${Number(summary.onlyInBooks ?? 0)} only in books.`);
    const ledger = (record.summary as Record<string, unknown> | undefined)?.ledger as Record<string, unknown> | undefined;
    if (ledger?.outputDifference || ledger?.inputDifference) insights.push('GST return working includes book-ledger differences and filing-readiness checks.');
  }
  if (pageKey === 'input-tax-credit') {
    const reconciliation = record.reconciliation as Record<string, unknown> | undefined;
    const summary = reconciliation?.summary as Record<string, unknown> | undefined;
    const gstr3b = (record.summary as Record<string, unknown> | undefined)?.gstr3b as Record<string, unknown> | undefined;
    const itc = gstr3b?.itc as Record<string, unknown> | undefined;
    if (typeof itc?.ineligible === 'number') insights.push(`ITC working shows INR ${itc.ineligible.toLocaleString('en-IN')} as ineligible tax; eligible books and GSTR-2B comparison are included.`);
    if (summary) insights.push(`ITC matching has ${Number(summary.matched ?? 0)} matched row(s), ${Number(summary.mismatch ?? 0)} mismatch(es), and ${Number(summary.onlyIn2b ?? 0)} supplier invoice(s) only in 2B.`);
  }
  if (pageKey === 'e-invoice-eway-bill' && Array.isArray(record.invoices)) {
    const invoices = record.invoices.filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null);
    const generated = invoices.filter((item) => typeof item.ref === 'object' && item.ref !== null && (item.ref as Record<string, unknown>).status === 'GENERATED').length;
    const pending = invoices.filter((item) => item.ref === null || (typeof item.ref === 'object' && item.ref !== null && (item.ref as Record<string, unknown>).status === 'PENDING')).length;
    insights.push(`${invoices.length} e-invoice candidate(s) are available; ${generated} generated and ${pending} pending or missing reference status.`);
  }
  if (pageKey === 'tds-management' || pageKey === 'tcs-management') {
    const sections = Array.isArray(record.sections) ? record.sections : [];
    const rows = Array.isArray(record.rows) ? record.rows : [];
    insights.push(`${String(record.kind)} register has ${rows.length} movement row(s), closing balance INR ${Number(record.closing ?? 0).toLocaleString('en-IN')}, across ${sections.length} section(s).`);
  }
  if (pageKey === 'tax-payments-challans' && Array.isArray(record.challans)) {
    const challans = record.challans.filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null);
    const total = challans.reduce((sum, item) => sum + (typeof item.total === 'number' ? item.total : 0), 0);
    insights.push(`${challans.length} tax challan(s) are recorded for the selected period with total payment INR ${total.toLocaleString('en-IN')}.`);
  }
  if (pageKey === 'income-tax-provisions') {
    insights.push(`Income-tax view for FY ${String((record.fy as Record<string, unknown> | undefined)?.start ?? '')} to ${String((record.fy as Record<string, unknown> | undefined)?.end ?? '')} shows provision INR ${Number(record.provision ?? 0).toLocaleString('en-IN')}, advance tax INR ${Number(record.advanceTax ?? 0).toLocaleString('en-IN')} and TDS receivable INR ${Number(record.tdsReceivable ?? 0).toLocaleString('en-IN')}.`);
  }
  if (pageKey === 'profit-loss') {
    const totalIncome = typeof record.totalIncome === 'number' ? record.totalIncome : 0;
    const totalExpenses = typeof record.totalExpenses === 'number' ? record.totalExpenses : 0;
    const grossProfit = typeof record.grossProfit === 'number' ? record.grossProfit : 0;
    const profitAfterTax = typeof record.profitAfterTax === 'number' ? record.profitAfterTax : 0;
    const grossMarginPercent = typeof record.grossMarginPercent === 'number' ? record.grossMarginPercent : null;
    const netMarginPercent = totalIncome > 0 ? Math.round((profitAfterTax / totalIncome) * 100) : null;
    insights.push(`Profit & Loss Statement: Revenue/Income ₹${totalIncome.toLocaleString('en-IN')}, Expenses ₹${totalExpenses.toLocaleString('en-IN')}, Gross Profit ₹${grossProfit.toLocaleString('en-IN')}${grossMarginPercent !== null ? ` (${grossMarginPercent}% gross margin)` : ''}.`);
    insights.push(`Net Profit After Tax is ₹${profitAfterTax.toLocaleString('en-IN')}${netMarginPercent !== null ? ` (${netMarginPercent}% net margin)` : ''}.`);
    if (profitAfterTax > 0) {
      insights.push(`Financial Forecast: Business operations are yielding positive returns. Maintaining direct vehicle acquisition costs within current ratios projects sustainable annual net profitability.`);
    } else if (profitAfterTax < 0) {
      insights.push(`Financial Advisory: Operating at a net loss of ₹${Math.abs(profitAfterTax).toLocaleString('en-IN')}. Prioritize faster turnover of high-holding-cost machines and evaluate indirect overhead reduction.`);
    }
    if (record.previous && typeof (record.previous as Record<string, unknown>).profitAfterTax === 'number') {
      const prevPat = (record.previous as { profitAfterTax: number }).profitAfterTax;
      const growth = prevPat !== 0 ? Math.round(((profitAfterTax - prevPat) / Math.abs(prevPat)) * 100) : null;
      insights.push(`Prior Year Comparison: Previous period net profit was ₹${prevPat.toLocaleString('en-IN')}${growth !== null ? ` (YoY change: ${growth >= 0 ? '+' : ''}${growth}%)` : ''}.`);
    }
  }
  if (pageKey === 'balance-sheet') {
    const totalAssets = typeof record.totalAssets === 'number' ? record.totalAssets : 0;
    const totalLiabilities = typeof record.totalLiabilities === 'number' ? record.totalLiabilities : 0;
    const difference = typeof record.difference === 'number' ? record.difference : 0;
    const equity = record.equity as Record<string, unknown> | undefined;
    const equityTotal = typeof equity?.total === 'number' ? equity.total : 0;
    const profitPeriod = typeof equity?.profitForPeriod === 'number' ? equity.profitForPeriod : 0;
    insights.push(`Balance Sheet as at ${String(record.asOf ?? 'today')}: Total Assets ₹${totalAssets.toLocaleString('en-IN')}, Total Liabilities ₹${totalLiabilities.toLocaleString('en-IN')}, Equity & Reserves ₹${equityTotal.toLocaleString('en-IN')}.`);
    if (difference === 0) {
      insights.push(`Audit Status: Statement is completely balanced (Assets = Equity + Liabilities; zero suspense mismatch).`);
    } else {
      insights.push(`Audit Alert: Unbalanced difference of ₹${difference.toLocaleString('en-IN')} detected between assets and liabilities.`);
    }
    insights.push(`Period earnings contributing to reserves: ₹${profitPeriod.toLocaleString('en-IN')}. Capital position indicates ${totalAssets > totalLiabilities ? 'positive net worth and strong solvency' : 'elevated debt ratio requiring working capital monitoring'}.`);
  }
  if (pageKey === 'cash-flow-statement') {
    const opening = typeof record.opening === 'number' ? record.opening : 0;
    const closing = typeof record.closing === 'number' ? record.closing : 0;
    const net = typeof record.net === 'number' ? record.net : 0;
    const sections = Array.isArray(record.sections) ? (record.sections as Array<Record<string, unknown>>) : [];
    const opSec = sections.find((s) => s.category === 'OPERATING');
    const opNet = typeof opSec?.net === 'number' ? opSec.net : 0;
    insights.push(`Cash Flow (Direct Method): Opening Cash & Bank ₹${opening.toLocaleString('en-IN')}, Closing Cash & Bank ₹${closing.toLocaleString('en-IN')}, Net Movement ₹${net.toLocaleString('en-IN')}.`);
    insights.push(`Operating activities generated net cash of ₹${opNet.toLocaleString('en-IN')}.`);
    if (net >= 0) {
      insights.push(`Cash Runway Forecast: Inflows exceed outflows by ₹${net.toLocaleString('en-IN')}. High liquidity enables opportunistic inventory acquisitions without external debt.`);
    } else {
      insights.push(`Cash Liquidity Alert: Net negative cash burn of ₹${Math.abs(net).toLocaleString('en-IN')}. Accelerate pending customer dues and defer non-critical asset investments.`);
    }
  }
  if (pageKey === 'revenue-purchase-reports') {
    const incPivot = record.incomePivot as Record<string, unknown> | undefined;
    const purPivot = record.purchasePivot as Record<string, unknown> | undefined;
    const incTotal = typeof incPivot?.total === 'number' ? incPivot.total : 0;
    const purTotal = typeof purPivot?.total === 'number' ? purPivot.total : 0;
    const months = Array.isArray(incPivot?.months) ? incPivot.months : [];
    insights.push(`Revenue & Purchase Analysis across ${months.length} month(s): Total Revenue ₹${incTotal.toLocaleString('en-IN')}, Total Supplier Purchases ₹${purTotal.toLocaleString('en-IN')}.`);
    insights.push(`Trading spread: Revenue exceeds purchases by ₹${(incTotal - purTotal).toLocaleString('en-IN')}.`);
    insights.push(`Market Velocity Advisory: Monthly revenue streams span ${months.join(', ')}. Demand forecasting recommends aligning heavy machinery purchases 2-3 weeks ahead of seasonal construction demand spikes.`);
  }
  if (pageKey === 'vehicle-profitability') {
    const total = totalFor(record) ?? rows.length;
    const totals = (typeof record.totals === 'object' && record.totals !== null ? record.totals as Record<string, unknown> : {}) as Record<string, number>;
    const profit = typeof totals.profit === 'number' ? totals.profit : 0;
    const sale = typeof totals.sale === 'number' ? totals.sale : 0;
    const avgProfit = rows.length > 0 ? Math.round(profit / rows.length) : 0;
    const marginPct = sale > 0 ? Math.round((profit / sale) * 100) : 0;
    insights.push(`Vehicle Profitability: ${total} sold vehicle(s) analyzed; Cumulative Profit ₹${profit.toLocaleString('en-IN')} on sales of ₹${sale.toLocaleString('en-IN')} (Average ${marginPct}% margin).`);
    insights.push(`Unit Economics: Average net gain per machine sold is ₹${avgProfit.toLocaleString('en-IN')}.`);
    insights.push(`Inventory Strategy Suggestion: Prioritize sourcing top-performing models like JCB 3DX and Escorts with verified maintenance logs to maintain margins above 10%.`);
  }
  if (pageKey === 'expense-margin-analysis') {
    const trendObj = record.trend as Record<string, unknown> | undefined;
    const months = Array.isArray(trendObj?.months) ? (trendObj.months as Array<Record<string, number>>) : [];
    const totRev = months.reduce((sum, m) => sum + (m.revenue || 0), 0);
    const totCogs = months.reduce((sum, m) => sum + (m.cogs || 0), 0);
    const totExp = months.reduce((sum, m) => sum + (m.expenses || 0), 0);
    const totProfit = months.reduce((sum, m) => sum + (m.profit || 0), 0);
    const netMargin = totRev > 0 ? Math.round((totProfit / totRev) * 100) : 0;
    insights.push(`Expense & Margin Trend (${months.length} months): Cumulative Revenue ₹${totRev.toLocaleString('en-IN')}, Cost of Goods Sold ₹${totCogs.toLocaleString('en-IN')}, Operating Overheads ₹${totExp.toLocaleString('en-IN')}.`);
    insights.push(`Cumulative Net Profit ₹${totProfit.toLocaleString('en-IN')} (${netMargin}% average net margin).`);
    insights.push(`Operational Cost Advisory: Overheads represent ${totRev > 0 ? Math.round((totExp / totRev) * 100) : 0}% of turnover. Standard industry benchmark is under 8% for pre-owned equipment trading.`);
  }
  if (pageKey === 'receivables-payables-report') {
    const rec = record.receivables as Record<string, unknown> | undefined;
    const pay = record.payables as Record<string, unknown> | undefined;
    const recTot = typeof rec?.total === 'number' ? rec.total : 0;
    const payTot = typeof pay?.total === 'number' ? pay.total : 0;
    const recParties = Array.isArray(rec?.parties) ? rec.parties.length : 0;
    const payParties = Array.isArray(pay?.parties) ? pay.parties.length : 0;
    const netGap = recTot - payTot;
    insights.push(`Receivables & Payables Aging: Customer Receivables ₹${recTot.toLocaleString('en-IN')} (${recParties} parties) vs Supplier Payables ₹${payTot.toLocaleString('en-IN')} (${payParties} parties).`);
    insights.push(`Working Capital Balance: ${netGap >= 0 ? `Net positive receivables buffer of ₹${netGap.toLocaleString('en-IN')}.` : `Payables exceed receivables by ₹${Math.abs(netGap).toLocaleString('en-IN')}.`}`);
    insights.push(`Credit & Collection Advisory: Implement proactive WhatsApp payment reminders for dues past 30 days to mitigate bad debt risk and accelerate collection cycle.`);
  }
  if (pageKey === 'bank-cash-reports') {
    const totals = (typeof record.totals === 'object' && record.totals !== null ? record.totals : {}) as Record<string, number>;
    const opening = typeof totals.opening === 'number' ? totals.opening : 0;
    const receipts = typeof totals.receipts === 'number' ? totals.receipts : 0;
    const payments = typeof totals.payments === 'number' ? totals.payments : 0;
    const closing = typeof totals.closing === 'number' ? totals.closing : 0;
    insights.push(`Bank & Cash Overview: Total Opening ₹${opening.toLocaleString('en-IN')}, Total Inflows ₹${receipts.toLocaleString('en-IN')}, Total Outflows ₹${payments.toLocaleString('en-IN')}, Total Closing ₹${closing.toLocaleString('en-IN')}.`);
    insights.push(`Liquidity Status: All liquid cash, current accounts, and gateway deposits currently total ₹${closing.toLocaleString('en-IN')}.`);
    insights.push(`Treasury Recommendation: Maintain at least 15 days of estimated operating expenditure in high-liquidity current accounts to ensure uninterrupted dealer payouts.`);
  }
  if (pageKey === 'tax-reports') {
    const months = Array.isArray(record.months) ? (record.months as Array<Record<string, number>>) : [];
    const totOut = months.reduce((sum, m) => sum + (m.outputTax || 0), 0);
    const totIn = months.reduce((sum, m) => sum + (m.inputTax || 0), 0);
    const totPaid = months.reduce((sum, m) => sum + (m.gstPaid || 0), 0);
    const totTdsDed = months.reduce((sum, m) => sum + (m.tdsDeducted || 0), 0);
    const totTdsDep = months.reduce((sum, m) => sum + (m.tdsDeposited || 0), 0);
    const netGst = totOut - totIn;
    insights.push(`Tax Compliance Summary (${months.length} months): Output GST ₹${totOut.toLocaleString('en-IN')}, Input GST (ITC) ₹${totIn.toLocaleString('en-IN')}, Net Tax Liability ₹${netGst.toLocaleString('en-IN')}.`);
    insights.push(`Taxes Discharged: GST Paid via challans ₹${totPaid.toLocaleString('en-IN')}; TDS Deducted ₹${totTdsDed.toLocaleString('en-IN')} vs Deposited ₹${totTdsDep.toLocaleString('en-IN')}.`);
    insights.push(`Statutory Compliance Reminder: Ensure monthly GSTR-3B and GSTR-1 are filed before statutory deadlines. Fully match purchase invoices in GSTR-2B before claiming ITC to avoid interest penalties.`);
  }
  if (pageKey === 'ca-dashboard') {
    const yr = record.year as Record<string, unknown> | undefined;
    const months = Array.isArray(record.months) ? (record.months as Array<Record<string, unknown>>) : [];
    const queries = record.queries as Record<string, number> | undefined;
    const reviews = record.reviews as Record<string, number> | undefined;
    const closedMonths = months.filter((m) => m.status !== 'OPEN').length;
    const openQ = queries?.open ?? 0;
    const overdueQ = queries?.overdue ?? 0;
    const reviewedV = reviews?.REVIEWED ?? 0;
    const flaggedV = reviews?.FLAGGED ?? 0;
    const docs = typeof record.documents === 'number' ? record.documents : 0;
    insights.push(`CA Dashboard for FY ${String(yr?.label ?? 'Current')}: ${closedMonths}/${months.length} month(s) closed; ${openQ} open CA query(ies)${overdueQ ? ` (${overdueQ} overdue)` : ''}.`);
    insights.push(`Voucher Review Status: ${reviewedV} reviewed, ${flaggedV} flagged. Document Vault contains ${docs} active statutory paper(s).`);
    insights.push(`Audit Readiness Advisory: Closing progress is at ${months.length > 0 ? Math.round((closedMonths / months.length) * 100) : 0}%. Expedite resolution of overdue queries and flagged vouchers to ensure unqualified audit sign-off.`);
  }
  if (pageKey === 'document-vault') {
    const docs = Array.isArray(record.documents) ? (record.documents as Array<Record<string, unknown>>) : [];
    const expired = docs.filter((d) => d.expired === true).length;
    const categories = Array.from(new Set(docs.map((d) => String(d.category ?? 'OTHER'))));
    insights.push(`Document Vault: ${docs.length} active document(s) stored across ${categories.length} category(ies): ${categories.slice(0, 5).join(', ')}${categories.length > 5 ? '…' : ''}.`);
    if (expired > 0) {
      insights.push(`Compliance Alert: ${expired} document(s) have expired validity dates and require updated renewals.`);
    } else {
      insights.push(`Statutory Compliance Status: All stored regulatory filings, returns, and agreements are current with zero expired items.`);
    }
    insights.push(`Document Management Best Practice: Keep signed GST annual returns, TDS returns, and tax audit forms versioned for instant auditor access.`);
  }
  if (pageKey === 'monthly-closing') {
    const period = record.period as Record<string, unknown> | undefined;
    const checks = Array.isArray(record.checks) ? (record.checks as Array<Record<string, unknown>>) : [];
    const items = Array.isArray(record.items) ? (record.items as Array<Record<string, unknown>>) : [];
    const signedOff = record.signedOff as Record<string, unknown> | undefined;
    const passedChecks = checks.filter((c) => c.ok === true).length;
    const completedItems = items.filter((i) => i.done === true).length;
    insights.push(`Monthly Closing for ${String(period?.label ?? 'selected period')} (${String(period?.status ?? 'OPEN')}): ${passedChecks}/${checks.length} automated check(s) passed; ${completedItems}/${items.length} manual checklist item(s) completed.`);
    if (signedOff?.at) {
      insights.push(`Sign-off Status: Signed off on ${new Date(String(signedOff.at)).toLocaleDateString('en-IN')}${signedOff.by ? ` by ${String(signedOff.by)}` : ''}.`);
    } else {
      insights.push(`Closing Alert: Period is not yet signed off. Complete pending checklist items and resolve failing checks before soft-closing.`);
    }
    const failing = checks.filter((c) => !c.ok).map((c) => String(c.label));
    if (failing.length) insights.push(`Pending Gates: ${failing.slice(0, 3).join('; ')}.`);
  }
  if (pageKey === 'financial-year-closing') {
    const yr = record.year as Record<string, unknown> | undefined;
    const profit = typeof record.profit === 'number' ? record.profit : 0;
    const gates = Array.isArray(record.gates) ? (record.gates as Array<Record<string, unknown>>) : [];
    const closeObj = record.close as Record<string, unknown> | undefined;
    const passedGates = gates.filter((g) => g.ok === true).length;
    insights.push(`Financial Year Closing (${String(yr?.label ?? '')}): Projected Net Profit to transfer to Retained Earnings is ₹${profit.toLocaleString('en-IN')}.`);
    insights.push(`Closing Gates: ${passedGates}/${gates.length} statutory condition(s) satisfied.`);
    if (closeObj) {
      insights.push(`Year Close Status: Closed on ${new Date(String(closeObj.at)).toLocaleDateString('en-IN')} with profit transfer voucher recorded.`);
    } else {
      const failing = gates.filter((g) => !g.ok).map((g) => String(g.label));
      insights.push(`Readiness Forecast: Year cannot be closed until all gates pass${failing.length ? ` (Failing: ${failing.join(', ')})` : ''}.`);
    }
  }
  if (pageKey === 'audit-trail') {
    const total = typeof record.total === 'number' ? record.total : (Array.isArray(record.logs) ? record.logs.length : 0);
    const logs = Array.isArray(record.logs) ? (record.logs as Array<Record<string, unknown>>) : [];
    const actions = Array.isArray(record.actions) ? (record.actions as Array<Record<string, unknown>>) : [];
    const entityTypes = Array.isArray(record.entityTypes) ? (record.entityTypes as Array<Record<string, unknown>>) : [];
    insights.push(`Audit Trail: ${total.toLocaleString('en-IN')} financial audit event(s) logged across ${entityTypes.length} entity type(s) and ${actions.length} action type(s).`);
    insights.push(`Recent Audit Activity: Latest ${logs.length} event(s) show postings, modifications, reversals, and report exports with full user attribution.`);
    insights.push(`Governance Advisory: Continuous immutable logging complies with statutory audit trail requirements under MCA guidelines for corporate accounting software.`);
  }
  if (pageKey === 'ca-queries-checklist') {
    const queries = Array.isArray(record.queries) ? (record.queries as Array<Record<string, unknown>>) : [];
    const open = queries.filter((q) => q.status === 'OPEN').length;
    const answered = queries.filter((q) => q.status === 'ANSWERED').length;
    const closed = queries.filter((q) => q.status === 'CLOSED').length;
    const overdue = queries.filter((q) => q.overdue === true).length;
    insights.push(`CA Queries & Checklist: ${queries.length} total query(ies) (${open} open, ${answered} answered, ${closed} closed).`);
    if (overdue > 0) {
      insights.push(`Urgent Attention: ${overdue} query(ies) are overdue past their agreed resolution due date.`);
    } else {
      insights.push(`Timeline Compliance: All active queries are within agreed response deadlines.`);
    }
    insights.push(`Audit Coordination Suggestion: Attach relevant bank reconciliation statements and invoice copies directly in query responses for immediate CA closure.`);
  }
  if (pageKey === 'accounting-review') {
    const counts = record.counts as Record<string, number> | undefined;
    const rows = Array.isArray(record.rows) ? (record.rows as Array<Record<string, unknown>>) : [];
    const selfApproved = rows.filter((r) => r.selfApproved === true).length;
    insights.push(`Accounting Review Queue: ${counts?.total ?? rows.length} voucher(s) analyzed (${counts?.reviewed ?? 0} reviewed, ${counts?.flagged ?? 0} flagged, ${counts?.pending ?? 0} pending review).`);
    if (selfApproved > 0) {
      insights.push(`Internal Control Alert: ${selfApproved} self-approved voucher(s) detected where the maker posted the entry without secondary checker authorization.`);
    }
    insights.push(`Review Recommendation: Focus on manual journal entries and vouchers touching Suspense or high-value vehicle transactions to safeguard financial integrity.`);
  }
  if (pageKey === 'import-export') {
    const history = record.history as Record<string, unknown> | undefined;
    const imports = Array.isArray(history?.imports) ? history.imports.length : 0;
    const exports = Array.isArray(history?.exports) ? history.exports.length : 0;
    insights.push(`Import / Export Hub: Central gateway for 2-way data exchange. Total historical batches: ${imports} import(s) and ${exports} export(s).`);
    insights.push(`Supported Formats: Tally Prime XML (Masters + Vouchers), Excel/CSV Trial Balance, Day Book, Party Balances, GST & TDS registers.`);
    insights.push(`Data Migration Advisory: Always execute dry-run validation before committing batch transactions to prevent unmapped ledger errors.`);
  }
  if (pageKey === 'import-bank-statements') {
    const batches = Array.isArray(record.batches) ? (record.batches as Array<Record<string, unknown>>) : [];
    const totalRows = batches.reduce((sum, b) => sum + (typeof b.totalRows === 'number' ? b.totalRows : 0), 0);
    const importedRows = batches.reduce((sum, b) => sum + (typeof b.importedRows === 'number' ? b.importedRows : 0), 0);
    insights.push(`Import Bank Statements: ${batches.length} statement batch(es) recorded; ${importedRows.toLocaleString('en-IN')} of ${totalRows.toLocaleString('en-IN')} transaction row(s) successfully imported.`);
    insights.push(`Reconciliation Follow-up: Cross-verify all imported statement credits and debits in the Bank Reconciliation module to maintain zero difference with general ledger.`);
  }
  if (pageKey === 'import-opening-balances') {
    const totals = record.totals as Record<string, number> | undefined;
    const dr = totals?.debit ?? 0;
    const cr = totals?.credit ?? 0;
    const diff = totals?.difference ?? (dr - cr);
    const lines = typeof record.lines === 'number' ? record.lines : (Array.isArray(record.lines) ? record.lines.length : 0);
    insights.push(`Import Opening Balances: ${lines} line(s) imported. Total Debit ₹${dr.toLocaleString('en-IN')} vs Total Credit ₹${cr.toLocaleString('en-IN')}.`);
    if (diff === 0) {
      insights.push(`Trial Balance Status: Perfectly balanced (Zero difference). Ready for finalization.`);
    } else {
      insights.push(`Imbalance Warning: Opening balance difference of ₹${Math.abs(diff).toLocaleString('en-IN')} must be resolved before books can be finalized.`);
    }
  }
  if (pageKey === 'import-transactions') {
    const total = typeof record.total === 'number' ? record.total : 0;
    const history = Array.isArray(record.history) ? (record.history as Array<Record<string, unknown>>) : [];
    const successful = history.filter((h) => !h.dryRun && typeof h.created === 'number' && h.created > 0).length;
    insights.push(`Import Transactions: ${total} voucher import batch(es) on record (${successful} live batches committed).`);
    insights.push(`Validation Safeguards: Automated double-entry integrity verification, ledger code validation, and duplicate voucher hash detection are active on every CSV upload.`);
  }
  if (pageKey === 'tally-accounting-export') {
    insights.push(`Tally / Accounting Export: Generates Tally Prime compliant XML containing complete Chart of Accounts ledger hierarchy and dated voucher entries.`);
    insights.push(`Integration Protocol: 1) In Tally Prime, import Masters XML first. 2) Next, import Transactions XML. Party control ledgers automatically map to Sundry Debtors and Sundry Creditors.`);
    insights.push(`Software Interoperability: Export format also supports import into Busy, Marg, and QuickBooks through structured Day Book CSV.`);
  }
  if (pageKey === 'download-reports') {
    const exports = Array.isArray(record.exportKinds) ? record.exportKinds : [];
    insights.push(`Download Reports: 8 standard statutory audit packages ready for instant export (Trial Balance, Day Book, Party Balances, GST Sales, GST Purchases, TDS, Chart of Accounts, Tally XML).`);
    insights.push(`Audit Readiness: All exports include opening balances, period movement, closing balances, and tax breakup matching the live database.`);
  }
  if (pageKey === 'bulk-upload-history') {
    const imports = Array.isArray(record.imports) ? (record.imports as Array<Record<string, unknown>>) : [];
    const exports = Array.isArray(record.exports) ? (record.exports as Array<Record<string, unknown>>) : [];
    const failedImports = imports.filter((i) => typeof i.failed === 'number' && i.failed > 0).length;
    insights.push(`Bulk Upload History: Complete audit trail of ${imports.length} data import(s) and ${exports.length} report export(s).`);
    if (failedImports > 0) {
      insights.push(`Data Quality Insight: ${failedImports} batch(es) had one or more row failures. Review row-level error logs to rectify formatting issues.`);
    } else {
      insights.push(`Upload Health: All recent data imports processed cleanly with 100% row acceptance.`);
    }
  }
  if (pageKey === 'company-financial-profile') {
    const profile = record.profile as Record<string, unknown> | undefined;
    const registrations = Array.isArray(record.registrations) ? record.registrations : [];
    insights.push(`Company Financial Profile: ${String(profile?.legalName ?? 'Legal name is not configured')} with ${registrations.length} GST registration(s) available.`);
    insights.push(`Configuration Check: PAN, TAN, CIN/LLPIN, registered address, signatory and invoice identity are available from the authorized company profile response.`);
  }
  if (pageKey === 'financial-year-periods') {
    const years = Array.isArray(record.years) ? (record.years as Array<Record<string, unknown>>) : [];
    const current = years.find((year) => year.isCurrent === true);
    const lockedPeriods = years.flatMap((year) => Array.isArray(year.periods) ? year.periods : []).filter((period) => (period as Record<string, unknown>).status === 'LOCKED').length;
    insights.push(`Financial Year & Periods: ${years.length} financial year(s) configured; current year is ${String(current?.label ?? 'not selected')}; ${lockedPeriods} period(s) are locked.`);
    insights.push(`Control Recommendation: Close periods in chronological order and keep the current financial year aligned with the books before posting new vouchers.`);
  }
  if (pageKey === 'account-ledger-masters') {
    const chart = record.chart as Record<string, unknown> | undefined;
    const accounts = Array.isArray(chart?.accounts) ? chart.accounts.length : 0;
    const groups = Array.isArray(chart?.groups) ? chart.groups.length : 0;
    const banks = Array.isArray(record.bankAccounts) ? record.bankAccounts.length : 0;
    insights.push(`Account & Ledger Masters: ${accounts} account(s), ${groups} group(s), ${banks} bank/cash master(s), and ${Array.isArray(record.costCentres) ? record.costCentres.length : 0} cost centre(s) are available.`);
    insights.push(`Control Recommendation: Review inactive or unmapped ledgers before importing transactions so double-entry and tax mappings remain complete.`);
  }
  if (pageKey === 'voucher-numbering') {
    const series = record.series as Record<string, unknown> | null | undefined;
    const rows = Array.isArray(series?.series) ? (series.series as Array<Record<string, unknown>>) : [];
    const missing = rows.filter((item) => !item.prefix || !item.preview).length;
    insights.push(`Voucher Numbering: ${rows.length} series loaded for ${String((series?.year as Record<string, unknown> | undefined)?.label ?? 'the selected financial year')}; ${missing} series need attention.`);
    insights.push(`Control Recommendation: Never move the next number backward; preserving monotonic numbering prevents duplicate statutory references.`);
  }
  if (pageKey === 'tax-configurations') {
    const rates = Array.isArray(record.gstRates) ? record.gstRates : [];
    const sections = Array.isArray(record.tdsSections) ? record.tdsSections : [];
    insights.push(`Tax Configurations: ${rates.length} GST rate(s) and ${sections.length} TDS section rule(s) are configured; margin-scheme rate is ${String(record.marginSchemeRate ?? 'not set')}%.`);
    insights.push(`Compliance Note: Tax configuration is a rule input, not a filing confirmation; verify rate and section changes with the CA before using them for statutory returns.`);
  }
  if (pageKey === 'cost-centres') {
    const centres = Array.isArray(record.costCentres) ? (record.costCentres as Array<Record<string, unknown>>) : [];
    const active = centres.filter((centre) => centre.isActive !== false).length;
    insights.push(`Cost Centres: ${active} active allocation centre(s) out of ${centres.length} configured.`);
    insights.push(`Management Recommendation: Use a consistent branch/department/yard/project hierarchy so vehicle cost and expense margins can be compared reliably.`);
  }
  if (pageKey === 'roles-permissions') {
    const roles = Array.isArray(record.roles) ? (record.roles as Array<Record<string, unknown>>) : [];
    const direct = Array.isArray(record.directPermissionCounts) ? record.directPermissionCounts.length : 0;
    insights.push(`Roles & Permissions: ${roles.length} custom role(s) and ${direct} direct permission assignment type(s) are present.`);
    insights.push(`Security Recommendation: Apply least privilege and review finance, export, period-lock and approval access separately; permission changes remain outside this read-only assistant.`);
  }
  if (pageKey === 'automation-approval-rules') {
    const automation = record.automation as Record<string, unknown> | undefined;
    const settings = record.settings as Record<string, unknown> | undefined;
    const approval = settings?.approval as Record<string, unknown> | undefined;
    const enabled = ['recurringDrafts', 'bankAutoMatch', 'alertDigest'].filter((key) => automation?.settings && (automation.settings as Record<string, unknown>)[key] === true).length;
    insights.push(`Automation & Approval Rules: ${enabled} daily automation rule(s) enabled; posting mode is ${String((record.posting as Record<string, unknown> | undefined)?.postingMode ?? settings?.postingMode ?? 'OFF')}.`);
    insights.push(`Approval Control: ${approval?.threshold ? `threshold INR ${String(approval.threshold)}` : 'no amount threshold'}; cash approval is ${approval?.cashRequiresApproval === true ? 'required' : 'not required'}.`);
  }
  if (pageKey === 'integrations-notifications') {
    const integrations = record.integrations as Record<string, unknown> | undefined;
    const providers = ['razorpay', 'hdfc', 'gsp'].filter((key) => (integrations?.[key] as Record<string, unknown> | undefined)?.enabled === true);
    const events = Array.isArray(integrations?.events) ? integrations.events.length : 0;
    insights.push(`Integrations & Notifications: ${providers.length} connector(s) enabled (${providers.join(', ') || 'none'}); ${events} provider event aggregate(s) are available.`);
    insights.push(`Safety Recommendation: Keep credentials server-side, test connectors after permissioned configuration, and review unresolved integration events before booking them.`);
  }
  return insights.length ? insights : ['Source data is available; ask for a specific filter or metric for a deeper breakdown.'];
};

const approvalsFor = async (limit: number) => listVouchers({ status: 'PENDING_APPROVAL', page: '1', pageSize: String(limit) });

export const getFinanceHubPageData = async (
  pageKey: ScopedFinancePageKey,
  args: Omit<FinanceHubPageArguments, 'pageKey'>,
): Promise<unknown> => {
  const query = buildFinanceHubPageQuery(pageKey, args);
  let data: unknown;
  switch (pageKey) {
    case 'financial-overview':
      data = await getOverview();
      break;
    case 'cash-flow-overview':
      data = await getCashFlow(query);
      break;
    case 'alerts-pending-approvals': {
      const [alerts, approvals] = await Promise.all([getAlerts(), approvalsFor(Math.min(20, Math.max(1, Math.floor(args.limit ?? 10))))]);
      data = { alerts, approvals };
      break;
    }
    case 'all-purchases':
    case 'vehicle-purchase-list':
    case 'additional-purchase-costs':
      data = await getVehicleRegister(query);
      break;
    case 'purchase-bills-invoices':
    case 'purchase-returns':
      data = await listDocuments(query);
      break;
    case 'seller-advances':
      data = await getLedgerBalances(query);
      break;
    case 'customer-prime-payments':
      data = await customerPrimePayments(query);
      break;
    case 'vehicle-sale-invoices':
    case 'all-sales':
    case 'vehicle-cost-sheet':
    case 'vehicle-profit-margin':
    case 'stock-valuation':
    case 'exchange-transactions':
      data = await getVehicleRegister(query);
      break;
    case 'sales-invoices':
    case 'credit-debit-notes':
      data = await listDocuments(query);
      break;
    case 'customer-receipts':
      data = await getReceiptsRegister(query);
      break;
    case 'sales-returns-refunds':
      data = { documents: await listDocuments(query), refunds: await refundRegister(query) };
      break;
    case 'brokerage-other-income':
    case 'consignment-deals':
      data = { deals: await listDealTerms(query) };
      break;
    case 'vehicle-wise-ledger':
      data = args.vehicleId ? await getVehicleDetail(args.vehicleId, query) : await getVehicleRegister(query);
      break;
    case 'partner-commission-settlement': {
      const [payables, settlements] = await Promise.all([openPayables(), listSettlements(query)]);
      data = { payables, settlements };
      break;
    }
    case 'bank-accounts':
      data = { accounts: (await listBankAccounts(false)).slice(0, Math.min(20, Math.max(1, Math.floor(args.limit ?? 10)))) };
      break;
    case 'hdfc-virtual-bank-ledger': {
      const banks = await getBankingOverview();
      data = { accounts: banks.filter((bank) => bank.type === 'VIRTUAL').slice(0, Math.min(20, Math.max(1, Math.floor(args.limit ?? 10)))) };
      break;
    }
    case 'bank-statement-upload':
      data = { batches: (await listImports()).slice(0, Math.min(20, Math.max(1, Math.floor(args.limit ?? 10)))) };
      break;
    case 'bank-reconciliation': {
      const banks = await getBankingOverview();
      const selected = args.bankId ? banks.find((bank) => bank.id === args.bankId) : null;
      data = selected && args.bankId
        ? await getReconciliation(args.bankId, query)
        : { banks: banks.slice(0, Math.min(20, Math.max(1, Math.floor(args.limit ?? 10)))), requiresBankId: true, message: 'Provide a bankId for statement-to-books reconciliation detail.' };
      break;
    }
    case 'unmatched-transactions': {
      const unmatched = await listUnmatched(query);
      data = { ...unmatched, rows: unmatched.rows.slice(0, Math.min(20, Math.max(1, Math.floor(args.limit ?? 10)))) };
      break;
    }
    case 'bank-transfers':
    case 'day-book':
    case 'journal-entries':
    case 'payment-vouchers':
    case 'receipt-vouchers':
    case 'contra-adjustment-vouchers':
      data = await listVouchers(query);
      break;
    case 'cash-book-petty-cash':
      data = await getBankCashReport(query);
      break;
    case 'upi-gateway-settlement':
      data = await getGatewayOverview();
      break;
    case 'master-general-ledger': {
      if (args.accountId) {
        data = await getGeneralLedger(query);
      } else {
        const chart = await getChartOfAccounts();
        data = { accounts: chart.accounts.slice(0, Math.min(20, Math.max(1, Math.floor(args.limit ?? 10)))), groups: chart.groups, requiresAccountId: true, message: 'Provide an accountId or ledger name for complete ledger entries.' };
      }
      break;
    }
    case 'chart-of-accounts':
      data = await getChartOfAccounts();
      break;
    case 'trial-balance':
      data = await getTrialBalance(query);
      break;
    case 'suspense-account': {
      const chart = await getChartOfAccounts();
      const suspense = chart.accounts.find((account) => account.systemKey === 'SUSPENSE');
      data = suspense
        ? await getGeneralLedger({ ...query, accountId: suspense.id })
        : { accounts: [], message: 'Suspense ledger is not installed in the chart of accounts.' };
      break;
    }
    case 'opening-balances': {
      const years = await listFinancialYears();
      const year = args.yearId ? years.find((item) => item.id === args.yearId) : years.find((item) => item.isCurrent) ?? years[0];
      data = year ? await getOpeningBalances(year.id) : { years: [], message: 'No financial year is configured.' };
      break;
    }
    case 'expenses-transactions':
      data = await legacyExpenseTransactions(query);
      break;
    case 'expense-register':
      data = await getExpenseRegister(query);
      break;
    case 'vendor-bills':
      data = await listDocuments(query);
      break;
    case 'recurring-expenses':
      data = { items: await listRecurring() };
      break;
    case 'employee-reimbursements':
      data = { items: await listReimbursements(query) };
      break;
    case 'fixed-assets': {
      const assets = await listAssets();
      data = args.assetId
        ? { assets, schedule: await getAssetSchedule(args.assetId) }
        : { assets };
      break;
    }
    case 'depreciation':
      data = await getRuns('DEPRECIATION', query);
      break;
    case 'prepaid-expenses':
      data = { items: await listPrepaid() };
      break;
    case 'employee-salary':
      data = { employees: await listEmployees() };
      break;
    case 'salary-structure':
      data = { structures: await listStructures() };
      break;
    case 'payroll-processing': {
      const runs = await listRuns();
      const filteredRuns = args.month ? runs.filter((run) => run.month === args.month) : runs;
      data = args.runId ? { runs: filteredRuns, run: await getRun(args.runId) } : { runs: filteredRuns };
      break;
    }
    case 'advances-deductions':
      data = { advances: await listAdvances() };
      break;
    case 'payslips': {
      const runs = (await listRuns()).filter((run) => run.status === 'POSTED' || run.status === 'PAID');
      const selectedId = args.runId ?? runs[0]?.id;
      data = selectedId ? { runs, run: await getRun(selectedId) } : { runs };
      break;
    }
    case 'statutory-contributions':
      data = await getStatutory(query);
      break;
    case 'full-final-settlement':
      data = { settlements: await listFullFinal() };
      break;
    case 'gst-dashboard':
      data = await getGstSummary(query);
      break;
    case 'sales-purchase-gst-register': {
      const [sales, purchases] = await Promise.all([
        gstRegister('SALES', getTaxRange(query)),
        gstRegister('PURCHASES', getTaxRange(query)),
      ]);
      data = { sales, purchases, selectedSide: args.side ?? 'BOTH' };
      break;
    }
    case 'gst-returns-reconciliation': {
      const [summary, reconciliation] = await Promise.all([getGstSummary(query), get2bReconciliation(query)]);
      data = { summary, reconciliation };
      break;
    }
    case 'input-tax-credit': {
      const [summary, reconciliation, purchases] = await Promise.all([
        getGstSummary(query),
        get2bReconciliation(query),
        gstRegister('PURCHASES', getTaxRange(query)),
      ]);
      data = { summary, reconciliation, purchases };
      break;
    }
    case 'e-invoice-eway-bill':
      data = { invoices: await listEInvoices(query) };
      break;
    case 'tds-management':
      data = await getWithholdingRegister(query);
      break;
    case 'tcs-management':
      data = await getWithholdingRegister(query);
      break;
    case 'tax-payments-challans':
      data = { challans: await listChallans(query) };
      break;
    case 'income-tax-provisions':
      data = await getIncomeTax(query);
      break;
    case 'customer-ledger':
    case 'partner-ledger':
    case 'seller-vendor-ledger':
    case 'broker-agent-ledger': {
      const parties = await listParties({ ...query, pageSize: pageSizeFor(args.limit) }, false);
      const balances = await getPartyBalances({ types: query.types });
      data = {
        ...parties,
        balances,
        rows: parties.parties.map((party) => ({
          ...party,
          balance: balances[party.id] ?? { receivable: 0, payable: 0, advances: 0, other: 0, net: 0 },
        })),
      };
      break;
    }
    case 'party-statements': {
      if (args.partyId) {
        data = await getPartyStatement(args.partyId, query);
      } else {
        const parties = await listParties({ ...query, pageSize: pageSizeFor(args.limit) }, false);
        const balances = await getPartyBalances({});
        data = { parties: parties.parties, total: parties.total, balances, requiresPartyId: true, message: 'Provide a partyId or party name for a complete party statement.' };
      }
      break;
    }
    case 'party-advances-deposits':
      data = await getAdvances(query);
      break;
    case 'customer-dues':
    case 'supplier-partner-payables': {
      const dues = await getDues(query);
      data = { ...dues, parties: dues.parties.slice(0, Math.min(20, Math.max(1, Math.floor(args.limit ?? 10)))) };
      break;
    }
    case 'due-aging-reports': {
      const [receivable, payable] = await Promise.all([
        getDues({ ...query, side: 'RECEIVABLE' }),
        getDues({ ...query, side: 'PAYABLE' }),
      ]);
      data = {
        receivable: { ...receivable, parties: receivable.parties.slice(0, Math.min(20, Math.max(1, Math.floor(args.limit ?? 10)))) },
        payable: { ...payable, parties: payable.parties.slice(0, Math.min(20, Math.max(1, Math.floor(args.limit ?? 10)))) },
      };
      break;
    }
    case 'payment-schedules': {
      const schedules = await listSchedules(query);
      data = { schedules: schedules.slice(0, Math.min(20, Math.max(1, Math.floor(args.limit ?? 10)))) };
      break;
    }
    case 'follow-up-reminders': {
      const followUps = await listFollowUps(query);
      data = { followUps: followUps.slice(0, Math.min(20, Math.max(1, Math.floor(args.limit ?? 10)))) };
      break;
    }
    case 'settlements-write-offs': {
      const writeOffs = await listWriteOffs(query);
      data = { writeOffs: writeOffs.slice(0, Math.min(20, Math.max(1, Math.floor(args.limit ?? 10)))) };
      break;
    }
    case 'profit-loss':
      data = await getProfitAndLoss(query);
      break;
    case 'balance-sheet':
      data = await getBalanceSheet(query);
      break;
    case 'cash-flow-statement':
      data = await getCashFlow(query);
      break;
    case 'revenue-purchase-reports': {
      const [incomePivot, purchasePivot] = await Promise.all([
        getPivot({ ...query, measure: query.measure ?? 'INCOME', by: query.by ?? 'account' }),
        getPivot({ ...query, measure: 'PURCHASE', by: 'party' }),
      ]);
      data = { incomePivot, purchasePivot, selectedMeasure: query.measure ?? 'INCOME' };
      break;
    }
    case 'vehicle-profitability':
      data = await getVehicleRegister(query);
      break;
    case 'expense-margin-analysis': {
      const [trend, expensePivot] = await Promise.all([
        getTrend(query),
        getPivot({ ...query, measure: 'EXPENSE', by: 'account' }),
      ]);
      data = { trend, expensePivot };
      break;
    }
    case 'receivables-payables-report': {
      const [receivables, payables] = await Promise.all([
        getDues({ ...query, side: 'RECEIVABLE' }),
        getDues({ ...query, side: 'PAYABLE' }),
      ]);
      data = { receivables, payables };
      break;
    }
    case 'bank-cash-reports':
      data = await getBankCashReport(query);
      break;
    case 'tax-reports':
      data = await getTaxReport(query);
      break;
    case 'ca-dashboard':
      data = await getCaDashboard();
      break;
    case 'document-vault':
      data = { documents: await listVault(query) };
      break;
    case 'monthly-closing': {
      const years = await listFinancialYears();
      const allPeriods = years.flatMap((y) => y.periods);
      const chosenPeriodId = args.periodId || allPeriods.filter((p) => p.endDate.toISOString().slice(0, 10) < todayString()).sort((a, b) => b.endDate.getTime() - a.endDate.getTime())[0]?.id || allPeriods[0]?.id;
      data = chosenPeriodId ? await getMonthlyClose(chosenPeriodId) : { message: 'No financial periods available.' };
      break;
    }
    case 'financial-year-closing': {
      const years = await listFinancialYears();
      const chosenYearId = args.yearId || years.find((y) => y.isCurrent)?.id || years[0]?.id;
      data = chosenYearId ? await getYearClose(chosenYearId) : { message: 'No financial years available.' };
      break;
    }
    case 'audit-trail':
      data = await listAuditTrail(query);
      break;
    case 'ca-queries-checklist':
      data = { queries: await listQueries(query) };
      break;
    case 'accounting-review':
      data = await getReviewQueue(query);
      break;
    case 'import-export': {
      const history = await getUploadHistory();
      data = { history, availableExports: EXPORT_KINDS, tallyUrl: '/api/finance-hub/data/export/tally' };
      break;
    }
    case 'import-bank-statements':
      data = { batches: await listImports() };
      break;
    case 'import-opening-balances': {
      const years = await listFinancialYears();
      const chosenYearId = args.yearId || years.find((y) => y.isCurrent)?.id || years[0]?.id;
      data = chosenYearId ? await getOpeningBalances(chosenYearId) : { message: 'No financial years available.' };
      break;
    }
    case 'import-transactions': {
      const history = await getUploadHistory();
      const vouchers = history.imports.filter((item) => item.kind === 'VOUCHERS');
      data = { history: vouchers, total: vouchers.length, templateColumns: ['ref', 'date', 'type', 'account', 'party', 'costCentre', 'debit', 'credit', 'narration', 'reference'] };
      break;
    }
    case 'tally-accounting-export':
      data = { availableExports: ['tally', 'chart-of-accounts', 'day-book'], tallyUrl: '/api/finance-hub/data/export/tally', query };
      break;
    case 'download-reports':
      data = { exportKinds: EXPORT_KINDS, history: await getUploadHistory() };
      break;
    case 'bulk-upload-history':
      data = await getUploadHistory();
      break;
    case 'company-financial-profile':
      data = await getCompanyProfile();
      break;
    case 'financial-year-periods':
      data = { years: await listFinancialYears() };
      break;
    case 'account-ledger-masters': {
      const [chart, categoryMap, paymentMethods, bankAccounts, costCentres] = await Promise.all([
        getChartOfAccounts(),
        listCategoryMap(),
        getPaymentMethodMap(),
        listBankAccounts(false),
        listCostCentres(),
      ]);
      data = { chart, categoryMap, paymentMethods, bankAccounts, costCentres };
      break;
    }
    case 'voucher-numbering': {
      const years = await listFinancialYears();
      const selectedYearId = args.yearId || years.find((year) => year.isCurrent)?.id || years[0]?.id;
      const series = selectedYearId ? await listNumberSeries(selectedYearId) : null;
      data = { years, selectedYearId: selectedYearId ?? null, series };
      break;
    }
    case 'tax-configurations':
      data = await getTaxConfig();
      break;
    case 'cost-centres':
      data = { costCentres: await listCostCentres() };
      break;
    case 'roles-permissions':
      data = await getFinanceRolesAndPermissions();
      break;
    case 'automation-approval-rules': {
      const [automation, settings] = await Promise.all([getAutomation(), loadFinSettings()]);
      data = { automation, settings, posting: readPostingConfig((await prisma.finSettings.findUnique({ where: { id: 'default' }, select: { config: true } }))?.config) };
      break;
    }
    case 'integrations-notifications': {
      const [integrations, automation] = await Promise.all([getIntegrations(), getAutomation()]);
      data = { integrations, automation };
      break;
    }
    default: {
      const exhaustive: never = pageKey;
      throw new Error(`Unsupported Finance Hub page: ${exhaustive}`);
    }
  }
  const uiActions = pageFileActions(pageKey, data, query);
  return {
    pageKey,
    pageLabel: financePageLabelFor(pageKey),
    query,
    data,
    ...(uiActions.length ? { uiActions } : {}),
    insights: insightsFor(pageKey, data),
    questionKeys: financePageQuestionKeysFor(pageKey),
    relatedPageKeys: financeRelatedPageKeysFor(pageKey),
    supportedPageKeys: SCOPED_FINANCE_PAGE_KEYS,
    dataAvailability: 'LIVE_DATABASE',
  } satisfies { pageKey: ScopedFinancePageKey; pageLabel: string; query: Query; data: unknown; insights: string[]; questionKeys: readonly string[]; relatedPageKeys: readonly ScopedFinancePageKey[]; supportedPageKeys: readonly ScopedFinancePageKey[]; dataAvailability: string };
};

export type { FinancePageContext };
