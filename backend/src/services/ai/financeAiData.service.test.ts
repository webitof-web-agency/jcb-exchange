import assert from 'node:assert/strict';
import test from 'node:test';
import { buildFinanceHubPageQuery } from './financeAiData.service';

const expectedDateRange = (days: number) => {
  const to = new Date();
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - Math.max(0, days - 1));
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
};

test('builds bounded page queries for scoped Overview and Purchases pages', () => {
  assert.deepEqual(buildFinanceHubPageQuery('cash-flow-overview', { days: 7, limit: 50 }), expectedDateRange(7));
  assert.deepEqual(buildFinanceHubPageQuery('all-purchases', { query: 'JCB 3DX', limit: 20, includeDrafts: true }), {
    q: 'JCB 3DX',
    status: 'booked',
    dateBasis: 'purchase',
    includeDrafts: 'true',
    page: '1',
    pageSize: '20',
  });
  assert.deepEqual(buildFinanceHubPageQuery('purchase-bills-invoices', { from: '2026-04-01', to: '2026-11-17', limit: 10 }), {
    types: 'PURCHASE_BILL',
    from: '2026-04-01',
    to: '2026-11-17',
    page: '1',
    pageSize: '10',
  });
  assert.deepEqual(buildFinanceHubPageQuery('purchase-returns', { query: 'DN-001', limit: 5 }), {
    types: 'DEBIT_NOTE',
    reason: 'RETURN',
    q: 'DN-001',
    page: '1',
    pageSize: '5',
  });
  assert.deepEqual(buildFinanceHubPageQuery('seller-advances', { includeDrafts: true }), {
    systemKey: 'SELLER_ADVANCES',
    includeDrafts: 'true',
  });
});

test('builds source-specific queries for selected Sales and Vehicle Finance pages', () => {
  assert.deepEqual(buildFinanceHubPageQuery('customer-prime-payments', { query: 'Ravi', limit: 20 }), {
    q: 'Ravi',
    page: '1',
    pageSize: '20',
  });
  assert.deepEqual(buildFinanceHubPageQuery('vehicle-sale-invoices', { query: 'INV-22', from: '2026-04-01', to: '2026-11-17', limit: 5 }), {
    q: 'INV-22',
    status: 'sold',
    dateBasis: 'sale',
    invoiced: 'true',
    from: '2026-04-01',
    to: '2026-11-17',
    page: '1',
    pageSize: '5',
  });
  assert.deepEqual(buildFinanceHubPageQuery('all-sales', { days: 7, limit: 10 }), {
    status: 'sold',
    dateBasis: 'sale',
    ...expectedDateRange(7),
    page: '1',
    pageSize: '10',
  });
  assert.deepEqual(buildFinanceHubPageQuery('customer-receipts', { query: 'UPI', days: 30, limit: 15 }), {
    q: 'UPI',
    ...expectedDateRange(30),
    page: '1',
    pageSize: '15',
  });
  assert.deepEqual(buildFinanceHubPageQuery('credit-debit-notes', { limit: 10 }), {
    types: 'CREDIT_NOTE,DEBIT_NOTE',
    page: '1',
    pageSize: '10',
  });
  assert.deepEqual(buildFinanceHubPageQuery('sales-returns-refunds', { query: 'CN-1', limit: 10 }), {
    types: 'CREDIT_NOTE',
    reason: 'RETURN',
    q: 'CN-1',
    page: '1',
    pageSize: '10',
  });
  assert.deepEqual(buildFinanceHubPageQuery('brokerage-other-income', { limit: 10 }), {
    brokerage: 'true',
    page: '1',
    pageSize: '10',
  });
  assert.deepEqual(buildFinanceHubPageQuery('vehicle-wise-ledger', { query: 'SA-1', includeDrafts: true }), {
    q: 'SA-1',
    includeDrafts: 'true',
  });
  assert.deepEqual(buildFinanceHubPageQuery('vehicle-cost-sheet', { asOf: '2026-11-01', limit: 10 }), {
    asOn: '2026-11-01',
    page: '1',
    pageSize: '10',
  });
  assert.deepEqual(buildFinanceHubPageQuery('vehicle-profit-margin', { limit: 10 }), {
    status: 'sold',
    dateBasis: 'sale',
    page: '1',
    pageSize: '10',
  });
  assert.deepEqual(buildFinanceHubPageQuery('stock-valuation', { asOf: '2026-11-17', limit: 10 }), {
    status: 'in_stock',
    asOn: '2026-11-17',
    page: '1',
    pageSize: '10',
  });
  assert.deepEqual(buildFinanceHubPageQuery('exchange-transactions', { limit: 10 }), {
    exchange: 'true',
    page: '1',
    pageSize: '10',
  });
  assert.deepEqual(buildFinanceHubPageQuery('consignment-deals', { limit: 10 }), {
    mode: 'CONSIGNMENT',
    page: '1',
    pageSize: '10',
  });
  assert.deepEqual(buildFinanceHubPageQuery('partner-commission-settlement', { query: 'Partner', limit: 10 }), {
    q: 'Partner',
    page: '1',
    pageSize: '10',
  });
});

test('builds source-specific queries for Party Ledgers and Receivables pages', () => {
  assert.deepEqual(buildFinanceHubPageQuery('customer-ledger', { query: 'Ravi', limit: 20 }), {
    types: 'CUSTOMER', q: 'Ravi', page: '1', pageSize: '20',
  });
  assert.deepEqual(buildFinanceHubPageQuery('seller-vendor-ledger', { limit: 10 }), {
    types: 'SELLER,VENDOR', page: '1', pageSize: '10',
  });
  assert.deepEqual(buildFinanceHubPageQuery('customer-dues', { asOf: '2026-11-17', limit: 15 }), {
    side: 'RECEIVABLE', asOf: '2026-11-17', items: 'true',
  });
  assert.deepEqual(buildFinanceHubPageQuery('supplier-partner-payables', { asOf: '2026-11-17', query: 'Satya' }), {
    side: 'PAYABLE', asOf: '2026-11-17', items: 'true', q: 'Satya',
  });
  assert.deepEqual(buildFinanceHubPageQuery('payment-schedules', { from: '2026-11-01', to: '2026-11-17', limit: 5 }), {
    from: '2026-11-01', to: '2026-11-17', page: '1', pageSize: '5',
  });
  assert.deepEqual(buildFinanceHubPageQuery('follow-up-reminders', { limit: 10 }), {
    status: 'OPEN', page: '1', pageSize: '10',
  });
  assert.deepEqual(buildFinanceHubPageQuery('settlements-write-offs', { limit: 10 }), {
    page: '1', pageSize: '10',
  });
});

test('builds source-specific queries for Banking & Cash and Accounting & Books pages', () => {
  assert.deepEqual(buildFinanceHubPageQuery('bank-accounts', {}), {});
  assert.deepEqual(buildFinanceHubPageQuery('hdfc-virtual-bank-ledger', {}), { type: 'VIRTUAL' });
  assert.deepEqual(buildFinanceHubPageQuery('bank-statement-upload', { limit: 10 }), { page: '1', pageSize: '10' });
  assert.deepEqual(buildFinanceHubPageQuery('bank-reconciliation', { bankId: 'bank-1', days: 7 }), { bankId: 'bank-1', ...expectedDateRange(7) });
  assert.deepEqual(buildFinanceHubPageQuery('unmatched-transactions', { days: 30 }), expectedDateRange(30));
  assert.deepEqual(buildFinanceHubPageQuery('bank-transfers', { limit: 5 }), { types: 'CONTRA', page: '1', pageSize: '5' });
  assert.deepEqual(buildFinanceHubPageQuery('cash-book-petty-cash', { days: 7 }), expectedDateRange(7));
  assert.deepEqual(buildFinanceHubPageQuery('upi-gateway-settlement', { limit: 10 }), { page: '1', pageSize: '10' });
  assert.deepEqual(buildFinanceHubPageQuery('master-general-ledger', { accountId: 'account-1', days: 7 }), { accountId: 'account-1', ...expectedDateRange(7) });
  assert.deepEqual(buildFinanceHubPageQuery('chart-of-accounts', {}), {});
  assert.deepEqual(buildFinanceHubPageQuery('day-book', { from: '2026-11-01', to: '2026-11-17', limit: 20 }), { from: '2026-11-01', to: '2026-11-17', page: '1', pageSize: '20' });
  assert.deepEqual(buildFinanceHubPageQuery('journal-entries', { limit: 10 }), { types: 'JOURNAL', page: '1', pageSize: '10' });
  assert.deepEqual(buildFinanceHubPageQuery('payment-vouchers', { limit: 10 }), { types: 'PAYMENT', page: '1', pageSize: '10' });
  assert.deepEqual(buildFinanceHubPageQuery('receipt-vouchers', { limit: 10 }), { types: 'RECEIPT', page: '1', pageSize: '10' });
  assert.deepEqual(buildFinanceHubPageQuery('contra-adjustment-vouchers', { limit: 10 }), { types: 'CONTRA,ADJUSTMENT', page: '1', pageSize: '10' });
  assert.deepEqual(buildFinanceHubPageQuery('trial-balance', { from: '2026-11-01', to: '2026-11-17' }), { from: '2026-11-01', to: '2026-11-17' });
  assert.deepEqual(buildFinanceHubPageQuery('suspense-account', { days: 7 }), expectedDateRange(7));
  assert.deepEqual(buildFinanceHubPageQuery('opening-balances', { yearId: 'year-1' }), { yearId: 'year-1' });
});

test('builds source-specific queries for Expenses & Assets pages', () => {
  assert.deepEqual(buildFinanceHubPageQuery('expenses-transactions', { days: 30, limit: 10 }), {
    ...expectedDateRange(30),
  });
  assert.deepEqual(buildFinanceHubPageQuery('expense-register', { from: '2026-04-01', to: '2026-11-17', query: 'rent', limit: 5 }), {
    from: '2026-04-01', to: '2026-11-17', q: 'rent', page: '1', pageSize: '5',
  });
  assert.deepEqual(buildFinanceHubPageQuery('vendor-bills', { days: 30, limit: 10 }), {
    types: 'PURCHASE_BILL,DEBIT_NOTE', ...expectedDateRange(30), page: '1', pageSize: '10',
  });
  assert.deepEqual(buildFinanceHubPageQuery('recurring-expenses', {}), {});
  assert.deepEqual(buildFinanceHubPageQuery('employee-reimbursements', { status: 'SUBMITTED' }), { status: 'SUBMITTED' });
  assert.deepEqual(buildFinanceHubPageQuery('fixed-assets', { limit: 10 }), {});
  assert.deepEqual(buildFinanceHubPageQuery('depreciation', { month: '2026-11' }), { month: '2026-11' });
  assert.deepEqual(buildFinanceHubPageQuery('prepaid-expenses', { limit: 10 }), {});
});

test('builds source-specific queries for Payroll pages', () => {
  assert.deepEqual(buildFinanceHubPageQuery('employee-salary', {}), {});
  assert.deepEqual(buildFinanceHubPageQuery('salary-structure', {}), {});
  assert.deepEqual(buildFinanceHubPageQuery('payroll-processing', { runId: 'run-1', month: '2026-11' }), {});
  assert.deepEqual(buildFinanceHubPageQuery('advances-deductions', {}), {});
  assert.deepEqual(buildFinanceHubPageQuery('payslips', { runId: 'run-1' }), {});
  assert.deepEqual(buildFinanceHubPageQuery('statutory-contributions', { month: '2026-10' }), { month: '2026-10' });
  assert.deepEqual(buildFinanceHubPageQuery('full-final-settlement', {}), {});
});

test('builds source-specific queries for Taxation & Compliance pages', () => {
  assert.deepEqual(buildFinanceHubPageQuery('gst-dashboard', { month: '2026-11' }), { month: '2026-11' });
  assert.deepEqual(buildFinanceHubPageQuery('sales-purchase-gst-register', { month: '2026-11', side: 'PURCHASES' }), { month: '2026-11', side: 'PURCHASES' });
  assert.deepEqual(buildFinanceHubPageQuery('gst-returns-reconciliation', { month: '2026-11' }), { month: '2026-11' });
  assert.deepEqual(buildFinanceHubPageQuery('input-tax-credit', { month: '2026-11' }), { month: '2026-11' });
  assert.deepEqual(buildFinanceHubPageQuery('e-invoice-eway-bill', { from: '2026-11-01', to: '2026-11-17' }), { from: '2026-11-01', to: '2026-11-17' });
  assert.deepEqual(buildFinanceHubPageQuery('tds-management', { month: '2026-11' }), { kind: 'TDS', side: 'PAYABLE', month: '2026-11' });
  assert.deepEqual(buildFinanceHubPageQuery('tcs-management', { month: '2026-11' }), { kind: 'TCS', side: 'PAYABLE', month: '2026-11' });
  assert.deepEqual(buildFinanceHubPageQuery('tax-payments-challans', { month: '2026-11', taxType: 'GST' }), { taxType: 'GST', month: '2026-11' });
  assert.deepEqual(buildFinanceHubPageQuery('income-tax-provisions', { to: '2026-11-17' }), { to: '2026-11-17' });
});

test('builds source-specific queries for Financial Reports pages', () => {
  assert.deepEqual(buildFinanceHubPageQuery('profit-loss', { from: '2026-04-01', to: '2026-11-17', compare: 'previous-year' }), { from: '2026-04-01', to: '2026-11-17', compare: 'previous-year' });
  assert.deepEqual(buildFinanceHubPageQuery('balance-sheet', { asOf: '2026-11-17', compare: 'previous-year' }), { asOf: '2026-11-17', compare: 'previous-year' });
  assert.deepEqual(buildFinanceHubPageQuery('cash-flow-statement', { from: '2026-04-01', to: '2026-11-17' }), { from: '2026-04-01', to: '2026-11-17' });
  assert.deepEqual(buildFinanceHubPageQuery('revenue-purchase-reports', { from: '2026-04-01', to: '2026-11-17', measure: 'INCOME', by: 'vehicle' }), { from: '2026-04-01', to: '2026-11-17', measure: 'INCOME', by: 'vehicle' });
  assert.deepEqual(buildFinanceHubPageQuery('vehicle-profitability', { from: '2026-04-01', to: '2026-11-17' }), { status: 'sold', dateBasis: 'sale', from: '2026-04-01', to: '2026-11-17', page: '1', pageSize: '10' });
  assert.deepEqual(buildFinanceHubPageQuery('expense-margin-analysis', { from: '2026-04-01', to: '2026-11-17' }), { from: '2026-04-01', to: '2026-11-17' });
  assert.deepEqual(buildFinanceHubPageQuery('receivables-payables-report', { asOf: '2026-11-17' }), { items: 'true', asOf: '2026-11-17' });
  assert.deepEqual(buildFinanceHubPageQuery('bank-cash-reports', { from: '2026-04-01', to: '2026-11-17' }), { from: '2026-04-01', to: '2026-11-17' });
  assert.deepEqual(buildFinanceHubPageQuery('tax-reports', { from: '2026-04-01', to: '2026-11-17' }), { from: '2026-04-01', to: '2026-11-17' });
});

test('builds source-specific queries for CA & Audit Workspace pages', () => {
  assert.deepEqual(buildFinanceHubPageQuery('ca-dashboard', {}), {});
  assert.deepEqual(buildFinanceHubPageQuery('document-vault', { category: 'GST_RETURN', archived: true }), { category: 'GST_RETURN', archived: 'true' });
  assert.deepEqual(buildFinanceHubPageQuery('monthly-closing', { periodId: 'period-1' }), {});
  assert.deepEqual(buildFinanceHubPageQuery('financial-year-closing', { yearId: 'year-1' }), {});
  assert.deepEqual(buildFinanceHubPageQuery('audit-trail', { from: '2026-04-01', to: '2026-11-17', limit: 10 }), { from: '2026-04-01', to: '2026-11-17', page: '1', pageSize: '10' });
  assert.deepEqual(buildFinanceHubPageQuery('ca-queries-checklist', { status: 'OPEN' }), { status: 'OPEN' });
  assert.deepEqual(buildFinanceHubPageQuery('accounting-review', { scope: 'manual', status: 'pending', minAmount: 50000 }), { scope: 'manual', status: 'pending', minAmount: '50000' });
  assert.deepEqual(buildFinanceHubPageQuery('import-export', {}), {});
  assert.deepEqual(buildFinanceHubPageQuery('import-bank-statements', {}), {});
  assert.deepEqual(buildFinanceHubPageQuery('import-opening-balances', { yearId: 'year-1' }), {});
  assert.deepEqual(buildFinanceHubPageQuery('import-transactions', {}), {});
  assert.deepEqual(buildFinanceHubPageQuery('tally-accounting-export', { from: '2026-04-01', to: '2026-11-17' }), { from: '2026-04-01', to: '2026-11-17' });
  assert.deepEqual(buildFinanceHubPageQuery('download-reports', { from: '2026-04-01', to: '2026-11-17' }), { from: '2026-04-01', to: '2026-11-17' });
  assert.deepEqual(buildFinanceHubPageQuery('bulk-upload-history', {}), {});
});

test('builds source-specific queries for Finance Settings pages', () => {
  assert.deepEqual(buildFinanceHubPageQuery('company-financial-profile', {}), {});
  assert.deepEqual(buildFinanceHubPageQuery('financial-year-periods', {}), {});
  assert.deepEqual(buildFinanceHubPageQuery('account-ledger-masters', {}), {});
  assert.deepEqual(buildFinanceHubPageQuery('voucher-numbering', { yearId: 'year-1' }), { yearId: 'year-1' });
  assert.deepEqual(buildFinanceHubPageQuery('tax-configurations', {}), {});
  assert.deepEqual(buildFinanceHubPageQuery('cost-centres', {}), {});
  assert.deepEqual(buildFinanceHubPageQuery('roles-permissions', {}), {});
  assert.deepEqual(buildFinanceHubPageQuery('automation-approval-rules', {}), {});
  assert.deepEqual(buildFinanceHubPageQuery('integrations-notifications', {}), {});
});
