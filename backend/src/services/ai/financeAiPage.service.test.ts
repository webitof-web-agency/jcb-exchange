import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SCOPED_FINANCE_PAGE_KEYS,
  financePageKeyFor,
  financePageQuestionKeysFor,
  financeRelatedPageKeysFor,
  financePagePermissionsFor,
} from './financeAiPage.service';

test('scoped Finance AI catalog contains the selected Finance pages', () => {
  assert.deepEqual(SCOPED_FINANCE_PAGE_KEYS, [
    'financial-overview',
    'cash-flow-overview',
    'alerts-pending-approvals',
    'all-purchases',
    'vehicle-purchase-list',
    'purchase-bills-invoices',
    'additional-purchase-costs',
    'purchase-returns',
    'seller-advances',
    'customer-prime-payments',
    'vehicle-sale-invoices',
    'all-sales',
    'sales-invoices',
    'customer-receipts',
    'credit-debit-notes',
    'sales-returns-refunds',
    'brokerage-other-income',
    'vehicle-wise-ledger',
    'vehicle-cost-sheet',
    'vehicle-profit-margin',
    'stock-valuation',
    'exchange-transactions',
    'consignment-deals',
    'partner-commission-settlement',
    'customer-ledger',
    'partner-ledger',
    'seller-vendor-ledger',
    'broker-agent-ledger',
    'party-statements',
    'party-advances-deposits',
    'customer-dues',
    'supplier-partner-payables',
    'due-aging-reports',
    'payment-schedules',
    'follow-up-reminders',
    'settlements-write-offs',
    'bank-accounts',
    'hdfc-virtual-bank-ledger',
    'bank-statement-upload',
    'bank-reconciliation',
    'unmatched-transactions',
    'bank-transfers',
    'cash-book-petty-cash',
    'upi-gateway-settlement',
    'master-general-ledger',
    'chart-of-accounts',
    'day-book',
    'journal-entries',
    'payment-vouchers',
    'receipt-vouchers',
    'contra-adjustment-vouchers',
    'trial-balance',
    'suspense-account',
    'opening-balances',
    'expenses-transactions',
    'expense-register',
    'vendor-bills',
    'recurring-expenses',
    'employee-reimbursements',
    'fixed-assets',
    'depreciation',
    'prepaid-expenses',
    'employee-salary',
    'salary-structure',
    'payroll-processing',
    'advances-deductions',
    'payslips',
    'statutory-contributions',
    'full-final-settlement',
    'gst-dashboard',
    'sales-purchase-gst-register',
    'gst-returns-reconciliation',
    'input-tax-credit',
    'e-invoice-eway-bill',
    'tds-management',
    'tcs-management',
    'tax-payments-challans',
    'income-tax-provisions',
    'profit-loss',
    'balance-sheet',
    'cash-flow-statement',
    'revenue-purchase-reports',
    'vehicle-profitability',
    'expense-margin-analysis',
    'receivables-payables-report',
    'bank-cash-reports',
    'tax-reports',
    'ca-dashboard',
    'document-vault',
    'monthly-closing',
    'financial-year-closing',
    'audit-trail',
    'ca-queries-checklist',
    'accounting-review',
    'import-export',
    'import-bank-statements',
    'import-opening-balances',
    'import-transactions',
    'tally-accounting-export',
    'download-reports',
    'bulk-upload-history',
    'company-financial-profile',
    'financial-year-periods',
    'account-ledger-masters',
    'voucher-numbering',
    'tax-configurations',
    'cost-centres',
    'roles-permissions',
    'automation-approval-rules',
    'integrations-notifications',
  ]);
});

test('routes English, Hinglish, and spelling variants to the correct Finance page', () => {
  assert.equal(financePageKeyFor('financial overview ka complete data batao'), 'financial-overview');
  assert.equal(financePageKeyFor('cashflow overview dikhao'), 'cash-flow-overview');
  assert.equal(financePageKeyFor('pending approvals aur alerts batao'), 'alerts-pending-approvals');
  assert.equal(financePageKeyFor('vehicle purchse list dikhao'), 'vehicle-purchase-list');
  assert.equal(financePageKeyFor('purchase bills and invoices ka detail'), 'purchase-bills-invoices');
  assert.equal(financePageKeyFor('additional purchase cost report'), 'additional-purchase-costs');
  assert.equal(financePageKeyFor('purchase returns ka status'), 'purchase-returns');
  assert.equal(financePageKeyFor('seller advances kitne hain'), 'seller-advances');
  assert.equal(financePageKeyFor('customer prime payments ka pura data'), 'customer-prime-payments');
  assert.equal(financePageKeyFor('vehicle sale invoices dikhao'), 'vehicle-sale-invoices');
  assert.equal(financePageKeyFor('all sales ka profit aur collection batao'), 'all-sales');
  assert.equal(financePageKeyFor('sales invoices ka data'), 'sales-invoices');
  assert.equal(financePageKeyFor('customer receipts ka detail'), 'customer-receipts');
  assert.equal(financePageKeyFor('credit debit notes dikhao'), 'credit-debit-notes');
  assert.equal(financePageKeyFor('sales returns and refunds ka status'), 'sales-returns-refunds');
  assert.equal(financePageKeyFor('brokerage and other income batao'), 'brokerage-other-income');
  assert.equal(financePageKeyFor('vehicle wise ledger dikhao'), 'vehicle-wise-ledger');
  assert.equal(financePageKeyFor('vehicle cost sheet ka detail'), 'vehicle-cost-sheet');
  assert.equal(financePageKeyFor('vehicle profit and margin batao'), 'vehicle-profit-margin');
  assert.equal(financePageKeyFor('stock valuation dikhao'), 'stock-valuation');
  assert.equal(financePageKeyFor('exchange transactions batao'), 'exchange-transactions');
  assert.equal(financePageKeyFor('consignment deals ka data'), 'consignment-deals');
  assert.equal(financePageKeyFor('partner commission and settlement batao'), 'partner-commission-settlement');
  assert.equal(financePageKeyFor('customer ledger ka detail'), 'customer-ledger');
  assert.equal(financePageKeyFor('partner ledger batao'), 'partner-ledger');
  assert.equal(financePageKeyFor('seller vendor ledger dikhao'), 'seller-vendor-ledger');
  assert.equal(financePageKeyFor('broker agent ledger batao'), 'broker-agent-ledger');
  assert.equal(financePageKeyFor('party statement ka pura data'), 'party-statements');
  assert.equal(financePageKeyFor('party advances and deposits'), 'party-advances-deposits');
  assert.equal(financePageKeyFor('customer dues batao'), 'customer-dues');
  assert.equal(financePageKeyFor('supplier partner payables ka detail'), 'supplier-partner-payables');
  assert.equal(financePageKeyFor('due aging reports dikhao'), 'due-aging-reports');
  assert.equal(financePageKeyFor('payment schedules batao'), 'payment-schedules');
  assert.equal(financePageKeyFor('follow up and reminders ka status'), 'follow-up-reminders');
  assert.equal(financePageKeyFor('settlements and write offs batao'), 'settlements-write-offs');
  assert.equal(financePageKeyFor('bank accounts ka detail'), 'bank-accounts');
  assert.equal(financePageKeyFor('HDFC virtual bank ledger batao'), 'hdfc-virtual-bank-ledger');
  assert.equal(financePageKeyFor('bank statement upload ka status'), 'bank-statement-upload');
  assert.equal(financePageKeyFor('bank reconciliation dikhao'), 'bank-reconciliation');
  assert.equal(financePageKeyFor('unmatched transactions batao'), 'unmatched-transactions');
  assert.equal(financePageKeyFor('bank transfers ka data'), 'bank-transfers');
  assert.equal(financePageKeyFor('cash book and petty cash'), 'cash-book-petty-cash');
  assert.equal(financePageKeyFor('UPI gateway settlement status'), 'upi-gateway-settlement');
  assert.equal(financePageKeyFor('master general ledger ka detail'), 'master-general-ledger');
  assert.equal(financePageKeyFor('chart of accounts dikhao'), 'chart-of-accounts');
  assert.equal(financePageKeyFor('day book ka data'), 'day-book');
  assert.equal(financePageKeyFor('journal entries batao'), 'journal-entries');
  assert.equal(financePageKeyFor('payment vouchers ka status'), 'payment-vouchers');
  assert.equal(financePageKeyFor('receipt vouchers dikhao'), 'receipt-vouchers');
  assert.equal(financePageKeyFor('contra and adjustment vouchers'), 'contra-adjustment-vouchers');
  assert.equal(financePageKeyFor('trial balance batao'), 'trial-balance');
  assert.equal(financePageKeyFor('suspense account ka detail'), 'suspense-account');
  assert.equal(financePageKeyFor('opening balances dikhao'), 'opening-balances');
  assert.equal(financePageKeyFor('expenses and transactions ka pura data'), 'expenses-transactions');
  assert.equal(financePageKeyFor('expense register dikhao'), 'expense-register');
  assert.equal(financePageKeyFor('vendor bills ka status'), 'vendor-bills');
  assert.equal(financePageKeyFor('recurring expenses batao'), 'recurring-expenses');
  assert.equal(financePageKeyFor('employee reimbursements dikhao'), 'employee-reimbursements');
  assert.equal(financePageKeyFor('fixed assets ka detail'), 'fixed-assets');
  assert.equal(financePageKeyFor('depreciation report batao'), 'depreciation');
  assert.equal(financePageKeyFor('prepaid expenses ka data'), 'prepaid-expenses');
  assert.equal(financePageKeyFor('employee salary ka detail'), 'employee-salary');
  assert.equal(financePageKeyFor('salary structure batao'), 'salary-structure');
  assert.equal(financePageKeyFor('payroll processing ka status'), 'payroll-processing');
  assert.equal(financePageKeyFor('advances and deductions dikhao'), 'advances-deductions');
  assert.equal(financePageKeyFor('payslips ka data'), 'payslips');
  assert.equal(financePageKeyFor('statutory contributions batao'), 'statutory-contributions');
  assert.equal(financePageKeyFor('full and final settlement ka detail'), 'full-final-settlement');
  assert.equal(financePageKeyFor('GST dashboard ka complete data'), 'gst-dashboard');
  assert.equal(financePageKeyFor('sales purchase GST register dikhao'), 'sales-purchase-gst-register');
  assert.equal(financePageKeyFor('GST returns and reconciliation batao'), 'gst-returns-reconciliation');
  assert.equal(financePageKeyFor('ITC eligible aur pending batao'), 'input-tax-credit');
  assert.equal(financePageKeyFor('e invoice e way bill ka status'), 'e-invoice-eway-bill');
  assert.equal(financePageKeyFor('TDS management dikhao'), 'tds-management');
  assert.equal(financePageKeyFor('TCS register ka detail'), 'tcs-management');
  assert.equal(financePageKeyFor('tax payments and challans batao'), 'tax-payments-challans');
  assert.equal(financePageKeyFor('income tax provisions ka data'), 'income-tax-provisions');
  assert.equal(financePageKeyFor('profit and loss statement batao'), 'profit-loss');
  assert.equal(financePageKeyFor('balance sheet dikhao'), 'balance-sheet');
  assert.equal(financePageKeyFor('cash flow statement ka details'), 'cash-flow-statement');
  assert.equal(financePageKeyFor('revenue purchase reports ka data'), 'revenue-purchase-reports');
  assert.equal(financePageKeyFor('vehicle profitability report dikhao'), 'vehicle-profitability');
  assert.equal(financePageKeyFor('expense margin analysis batao'), 'expense-margin-analysis');
  assert.equal(financePageKeyFor('receivables payables report dikhao'), 'receivables-payables-report');
  assert.equal(financePageKeyFor('bank and cash reports ka pura data'), 'bank-cash-reports');
  assert.equal(financePageKeyFor('tax reports summary dikhao'), 'tax-reports');
  assert.equal(financePageKeyFor('CA dashboard ka status batao'), 'ca-dashboard');
  assert.equal(financePageKeyFor('document vault ke files dikhao'), 'document-vault');
  assert.equal(financePageKeyFor('monthly closing checklist aur checks'), 'monthly-closing');
  assert.equal(financePageKeyFor('financial year closing gates batao'), 'financial-year-closing');
  assert.equal(financePageKeyFor('financial audit trail log data'), 'audit-trail');
  assert.equal(financePageKeyFor('ca queries and checklist dikhao'), 'ca-queries-checklist');
  assert.equal(financePageKeyFor('accounting review queue batao'), 'accounting-review');
  assert.equal(financePageKeyFor('import export hub ka status'), 'import-export');
  assert.equal(financePageKeyFor('import bank statements batches'), 'import-bank-statements');
  assert.equal(financePageKeyFor('import opening balances sheet'), 'import-opening-balances');
  assert.equal(financePageKeyFor('import transactions voucher list'), 'import-transactions');
  assert.equal(financePageKeyFor('tally accounting export xml'), 'tally-accounting-export');
  assert.equal(financePageKeyFor('download reports audit csv'), 'download-reports');
  assert.equal(financePageKeyFor('bulk upload history batches'), 'bulk-upload-history');
  assert.equal(financePageKeyFor('company financial profile ka pura data'), 'company-financial-profile');
  assert.equal(financePageKeyFor('financial year and periods batao'), 'financial-year-periods');
  assert.equal(financePageKeyFor('account ledger masters dikhao'), 'account-ledger-masters');
  assert.equal(financePageKeyFor('voucher numbering series'), 'voucher-numbering');
  assert.equal(financePageKeyFor('tax configurations ka status'), 'tax-configurations');
  assert.equal(financePageKeyFor('cost centres list'), 'cost-centres');
  assert.equal(financePageKeyFor('roles and permissions batao'), 'roles-permissions');
  assert.equal(financePageKeyFor('automation approval rules'), 'automation-approval-rules');
  assert.equal(financePageKeyFor('integrations and notifications'), 'integrations-notifications');
});

test('uses the current Finance page context for generic page questions', () => {
  assert.equal(
    financePageKeyFor('is page ka pura data aur suggestions do', { moduleKey: 'all-purchases' }),
    'all-purchases',
  );
  assert.equal(financePageKeyFor('is page ka data do', { moduleKey: 'payroll-processing' }), 'payroll-processing');
});

test('enforces page-level permissions instead of treating all scoped pages as one permission', () => {
  assert.deepEqual(financePagePermissionsFor('financial-overview'), ['fh.dashboard.read', 'fh.reports.read']);
  assert.deepEqual(financePagePermissionsFor('alerts-pending-approvals'), ['fh.dashboard.read', 'fh.approve']);
  assert.deepEqual(financePagePermissionsFor('all-purchases'), ['fh.purchases.read', 'fh.purchases.manage']);
  assert.deepEqual(financePagePermissionsFor('all-sales'), ['fh.sales.read', 'fh.sales.manage']);
  assert.deepEqual(financePagePermissionsFor('vehicle-profit-margin'), ['fh.vehicle.read', 'fh.vehicle.manage']);
  assert.deepEqual(financePagePermissionsFor('customer-prime-payments'), ['recurrence.manage']);
  assert.deepEqual(financePagePermissionsFor('partner-commission-settlement'), ['fh.vehicle.read', 'fh.vehicle.manage', 'fh.arap.read', 'fh.arap.manage']);
  assert.deepEqual(financePagePermissionsFor('customer-ledger'), ['fh.parties.read', 'fh.parties.manage']);
  assert.deepEqual(financePagePermissionsFor('party-statements'), ['fh.arap.read', 'fh.arap.manage', 'fh.parties.read', 'fh.parties.manage']);
  assert.deepEqual(financePagePermissionsFor('customer-dues'), ['fh.arap.read', 'fh.arap.manage']);
  assert.deepEqual(financePagePermissionsFor('bank-accounts'), ['fh.banking.read', 'fh.banking.manage', 'fh.banking.reconcile']);
  assert.deepEqual(financePagePermissionsFor('bank-reconciliation'), ['fh.banking.read', 'fh.banking.manage', 'fh.banking.reconcile']);
  assert.deepEqual(financePagePermissionsFor('master-general-ledger'), ['fh.books.read', 'fh.books.manage', 'fh.reports.read']);
  assert.deepEqual(financePagePermissionsFor('opening-balances'), ['fh.books.read', 'fh.books.manage', 'fh.books.post']);
  assert.deepEqual(financePagePermissionsFor('expense-register'), ['fh.expenses.read', 'fh.expenses.manage']);
  assert.deepEqual(financePagePermissionsFor('fixed-assets'), ['fh.expenses.read', 'fh.expenses.manage']);
  assert.deepEqual(financePagePermissionsFor('employee-salary'), ['fh.payroll.read', 'fh.payroll.manage']);
  assert.deepEqual(financePagePermissionsFor('gst-dashboard'), ['fh.tax.read', 'fh.tax.manage', 'fh.books.read', 'fh.reports.read', 'fh.ca.read']);
  assert.deepEqual(financePagePermissionsFor('profit-loss'), ['fh.reports.read', 'fh.books.read']);
  assert.deepEqual(financePagePermissionsFor('balance-sheet'), ['fh.reports.read', 'fh.books.read']);
  assert.deepEqual(financePagePermissionsFor('cash-flow-statement'), ['fh.reports.read', 'fh.books.read', 'fh.banking.read']);
  assert.deepEqual(financePagePermissionsFor('revenue-purchase-reports'), ['fh.reports.read', 'fh.sales.read', 'fh.purchases.read']);
  assert.deepEqual(financePagePermissionsFor('vehicle-profitability'), ['fh.vehicle.read', 'fh.reports.read']);
  assert.deepEqual(financePagePermissionsFor('expense-margin-analysis'), ['fh.reports.read', 'fh.expenses.read']);
  assert.deepEqual(financePagePermissionsFor('receivables-payables-report'), ['fh.arap.read', 'fh.reports.read']);
  assert.deepEqual(financePagePermissionsFor('bank-cash-reports'), ['fh.banking.read', 'fh.reports.read']);
  assert.deepEqual(financePagePermissionsFor('tax-reports'), ['fh.tax.read', 'fh.reports.read']);
  assert.deepEqual(financePagePermissionsFor('ca-dashboard'), ['fh.ca.read', 'fh.ca.manage', 'fh.books.read', 'fh.reports.read']);
  assert.deepEqual(financePagePermissionsFor('document-vault'), ['fh.ca.read', 'fh.ca.manage', 'fh.books.read', 'fh.reports.read']);
  assert.deepEqual(financePagePermissionsFor('monthly-closing'), ['fh.ca.read', 'fh.ca.manage', 'fh.books.read', 'fh.reports.read']);
  assert.deepEqual(financePagePermissionsFor('financial-year-closing'), ['fh.ca.read', 'fh.ca.manage', 'fh.books.read', 'fh.reports.read']);
  assert.deepEqual(financePagePermissionsFor('audit-trail'), ['fh.reports.read', 'fh.ca.read', 'fh.books.read']);
  assert.deepEqual(financePagePermissionsFor('ca-queries-checklist'), ['fh.ca.read', 'fh.ca.manage', 'fh.books.read', 'fh.reports.read']);
  assert.deepEqual(financePagePermissionsFor('accounting-review'), ['fh.ca.read', 'fh.ca.manage', 'fh.books.read', 'fh.reports.read']);
  assert.deepEqual(financePagePermissionsFor('import-export'), ['fh.ca.read', 'fh.ca.manage', 'fh.settings.manage', 'fh.import.manage', 'fh.export', 'fh.reports.export', 'fh.books.read', 'fh.reports.read']);
  assert.deepEqual(financePagePermissionsFor('tally-accounting-export'), ['fh.ca.read', 'fh.ca.manage', 'fh.settings.manage', 'fh.import.manage', 'fh.export', 'fh.reports.export', 'fh.books.read', 'fh.reports.read']);
  assert.deepEqual(financePagePermissionsFor('company-financial-profile'), ['fh.settings.manage', 'fh.period.lock']);
  assert.deepEqual(financePagePermissionsFor('financial-year-periods'), ['fh.settings.manage', 'fh.period.lock']);
  assert.deepEqual(financePagePermissionsFor('account-ledger-masters'), ['fh.settings.manage', 'fh.period.lock']);
  assert.deepEqual(financePagePermissionsFor('voucher-numbering'), ['fh.settings.manage', 'fh.period.lock']);
  assert.deepEqual(financePagePermissionsFor('tax-configurations'), ['fh.settings.manage', 'fh.period.lock']);
  assert.deepEqual(financePagePermissionsFor('cost-centres'), ['fh.settings.manage', 'fh.period.lock']);
  assert.deepEqual(financePagePermissionsFor('roles-permissions'), ['fh.settings.manage', 'fh.period.lock']);
  assert.deepEqual(financePagePermissionsFor('automation-approval-rules'), ['fh.settings.manage', 'fh.period.lock']);
  assert.deepEqual(financePagePermissionsFor('integrations-notifications'), ['fh.settings.manage', 'fh.period.lock']);
});

test('gives every selected page stable question keys for complete AI coverage', () => {
  SCOPED_FINANCE_PAGE_KEYS.forEach((pageKey) => assert.ok(financePageQuestionKeysFor(pageKey).length > 0, `${pageKey} needs question keys`));
  assert.ok(financePageQuestionKeysFor('vehicle-profit-margin').includes('profit_loss.breakdown'));
  assert.ok(financePageQuestionKeysFor('customer-receipts').includes('receipts.unposted'));
  assert.ok(financePageQuestionKeysFor('due-aging-reports').includes('aging.buckets'));
  assert.ok(financePageQuestionKeysFor('party-statements').includes('party_statement.closing'));
  assert.ok(financePageQuestionKeysFor('depreciation').includes('depreciation.runs'));
  assert.ok(financePageQuestionKeysFor('payslips').includes('payslips.download'));
});

test('exposes connected selected pages for cross-module follow-up questions', () => {
  assert.deepEqual(financeRelatedPageKeysFor('all-sales'), ['sales-invoices', 'customer-receipts', 'vehicle-profit-margin']);
  assert.deepEqual(financeRelatedPageKeysFor('consignment-deals'), ['vehicle-profit-margin', 'partner-commission-settlement', 'vehicle-wise-ledger']);
  assert.deepEqual(financeRelatedPageKeysFor('fixed-assets'), ['depreciation', 'master-general-ledger', 'chart-of-accounts']);
  assert.deepEqual(financeRelatedPageKeysFor('payroll-processing'), ['employee-salary', 'payslips', 'statutory-contributions', 'payment-vouchers']);
  SCOPED_FINANCE_PAGE_KEYS.forEach((pageKey) => assert.ok(Array.isArray(financeRelatedPageKeysFor(pageKey))));
});
