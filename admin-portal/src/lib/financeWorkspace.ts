export type FinanceWorkspaceGroup = {
  key: string;
  label: string;
  description: string;
  permissions: string[];
  modules: FinanceWorkspaceModule[];
};

export type FinanceWorkspaceTab = {
  key: string;
  label: string;
  description: string;
  readOnly?: boolean;
};

export type FinanceWorkspaceModule = {
  key: string;
  label: string;
  description: string;
  purpose: string;
  tabs?: FinanceWorkspaceTab[];
  existingPath?: string;
  status?: 'available' | 'planned' | 'linked';
};

const defaultTabs: FinanceWorkspaceTab[] = [
  { key: 'overview', label: 'Overview', description: 'KPI cards, filters, status and quick actions.' },
  { key: 'register', label: 'Register', description: 'Searchable register with date, party, vehicle, amount and status filters.' },
  { key: 'documents', label: 'Documents', description: 'Bills, invoices, receipts, statements and supporting attachments.' },
  { key: 'approvals', label: 'Approvals', description: 'Maker-checker status, pending actions and approval history.' },
  { key: 'activity', label: 'Activity', description: 'Audit trail, notes, imports, edits and linked records.' },
];

// Any one of these keys shows the group. Pages and APIs still check their own read/manage key.
const GROUP_PERMISSIONS: Record<string, string[]> = {
  dashboard: ['fh.dashboard.read', 'fh.approve'],
  purchases: ['fh.purchases.read', 'fh.purchases.manage'],
  'sales-revenue': ['fh.sales.read', 'fh.sales.manage'],
  'vehicle-finance': ['fh.vehicle.read', 'fh.vehicle.manage'],
  'party-ledgers': ['fh.parties.read', 'fh.parties.manage'],
  'receivables-payables': ['fh.arap.read', 'fh.arap.manage'],
  'banking-cash': ['fh.banking.read', 'fh.banking.manage', 'fh.banking.reconcile'],
  'accounting-books': ['fh.books.read', 'fh.books.manage', 'fh.books.post'],
  'expenses-assets': ['fh.expenses.read', 'fh.expenses.manage'],
  payroll: ['fh.payroll.read', 'fh.payroll.manage'],
  'taxation-compliance': ['fh.tax.read', 'fh.tax.manage'],
  'financial-reports': ['fh.reports.read', 'fh.reports.export'],
  'ca-audit-workspace': ['fh.ca.read', 'fh.ca.manage', 'fh.ca.query', 'fh.import.manage', 'fh.export'],
  'finance-settings': ['fh.settings.manage', 'fh.period.lock'],
};

const moduleGroup = (
  key: string,
  label: string,
  description: string,
  items: Array<[string, string, string, string?]>,
): FinanceWorkspaceGroup => ({
  key,
  label,
  description,
  permissions: GROUP_PERMISSIONS[key] || ['fh.settings.manage'],
  modules: items.map(([moduleKey, moduleLabel, moduleDescription, existingPath]) => ({
    key: moduleKey,
    label: moduleLabel,
    description: moduleDescription,
    purpose: `Manage ${moduleLabel.toLowerCase()} with linked parties, vehicles, documents and financial controls.`,
    existingPath,
    status: existingPath ? 'linked' : 'planned',
  })),
});

export const financeWorkspaceGroups: FinanceWorkspaceGroup[] = [
  moduleGroup('dashboard', 'Dashboard', 'Daily financial control centre.', [
    ['financial-overview', 'Financial Overview', 'Opening balance, income, expenses, profit, receivables and payables.', '/admin/dashboard'],
    ['cash-flow-overview', 'Cash Flow Overview', 'Cash and bank movement with inflow, outflow and closing balance.', '/admin/finance/expenses'],
    ['alerts-pending-approvals', 'Alerts & Pending Approvals', 'Unmatched entries, overdue dues, missing documents and pending approvals.'],
  ]),
  moduleGroup('purchases', 'Purchases', 'Purchase lifecycle from sourcing to settlement.', [
    ['all-purchases', 'All Purchases', 'Central purchase register with supplier, vehicle, cost and payment status.'],
    ['vehicle-purchase-list', 'Vehicle Purchase List', 'Vehicle-level purchase records and acquisition status.'],
    ['purchase-bills-invoices', 'Purchase Bills & Invoices', 'Supplier invoices, tax details, attachments and payment linkage.'],
    ['additional-purchase-costs', 'Additional Purchase Costs', 'Transport, RTO, repair, brokerage and other acquisition costs.'],
    ['purchase-returns', 'Purchase Returns', 'Return notes, reversal entries, reasons and settlement tracking.'],
    ['seller-advances', 'Seller Advances', 'Advance paid to sellers with adjustment and balance tracking.'],
  ]),
  moduleGroup('sales-revenue', 'Sales & Revenue', 'Sales, receipts, returns and other income.', [
    ['all-sales', 'All Sales', 'Sales register with customer, vehicle, invoice and collection status.'],
    ['sales-invoices', 'Sales Invoices', 'Invoice creation, numbering, tax, PDF download and cancellation control.', '/admin/invoices'],
    ['customer-receipts', 'Customer Receipts', 'Receipt vouchers, payment allocation and outstanding balance.'],
    ['credit-debit-notes', 'Credit / Debit Notes', 'Adjustment notes linked to invoices and ledgers.'],
    ['sales-returns-refunds', 'Sales Returns & Refunds', 'Return approvals, refund schedule and accounting reversal.'],
    ['brokerage-other-income', 'Brokerage & Other Income', 'Brokerage, service fees and non-vehicle income.'],
  ]),
  moduleGroup('vehicle-finance', 'Vehicle Finance', 'Vehicle profitability and deal-level finance.', [
    ['vehicle-wise-ledger', 'Vehicle-wise Ledger', 'Complete debit-credit ledger for one vehicle or deal.'],
    ['vehicle-cost-sheet', 'Vehicle Cost Sheet', 'Purchase price plus every directly attributable cost.'],
    ['vehicle-profit-margin', 'Vehicle Profit & Margin', 'Revenue, cost, GST/margin scheme and net profit.', '/admin/accounts/sell-accounts'],
    ['stock-valuation', 'Stock Valuation', 'Vehicle inventory valuation by cost, age and valuation method.'],
    ['exchange-transactions', 'Exchange Transactions', 'Exchange-in, exchange-out, valuation difference and linked sale.'],
    ['consignment-deals', 'Consignment Deals', 'Consignor terms, sale proceeds, commission and settlement.'],
    ['partner-commission-settlement', 'Partner Commission & Settlement', 'Commission calculation, approval and payout statement.'],
  ]),
  moduleGroup('party-ledgers', 'Party Ledgers', 'Unified party balances and statements.', [
    ['customer-ledger', 'Customer Ledger', 'Invoice, receipt, credit note and outstanding balance by customer.'],
    ['partner-ledger', 'Partner Ledger', 'Partner deposits, commission, deductions and payable balance.'],
    ['seller-vendor-ledger', 'Seller / Vendor Ledger', 'Purchase, advance, bill, payment and balance by seller/vendor.'],
    ['broker-agent-ledger', 'Broker / Agent Ledger', 'Brokerage due, paid, payable and supporting references.'],
    ['party-statements', 'Party Statements', 'Date-range statement with opening, movement, closing and export.'],
    ['party-advances-deposits', 'Party Advances & Deposits', 'Advance/deposit register, adjustments, refunds and ageing.'],
  ]),
  moduleGroup('receivables-payables', 'Receivables & Payables', 'Due control, ageing and settlements.', [
    ['customer-dues', 'Customer Dues', 'Invoice-wise receivable, promised date and collection status.'],
    ['supplier-partner-payables', 'Supplier / Partner Payables', 'Payable due by supplier, partner or broker.'],
    ['due-aging-reports', 'Due Aging Reports', '0-30, 31-60, 61-90 and 90+ day ageing buckets.'],
    ['payment-schedules', 'Payment Schedules', 'Scheduled inflows/outflows with reminders and approval.'],
    ['follow-up-reminders', 'Follow-up & Reminders', 'Owner-wise follow-ups, next action and notification history.'],
    ['settlements-write-offs', 'Settlements & Write-offs', 'Final settlement, discount, waiver and write-off approvals.'],
  ]),
  moduleGroup('banking-cash', 'Banking & Cash', 'Bank, cash and reconciliation controls.', [
    ['bank-accounts', 'Bank Accounts', 'Bank account masters, balances, limits and document vault.'],
    ['hdfc-virtual-bank-ledger', 'HDFC Virtual Bank Ledger', 'Dedicated virtual account ledger and settlement mapping.'],
    ['bank-statement-upload', 'Bank Statement Upload', 'CSV/XLS statement import with preview and duplicate detection.', '/admin/finance/expenses'],
    ['bank-reconciliation', 'Bank Reconciliation', 'Match book entries to statement rows with difference tracking.'],
    ['unmatched-transactions', 'Unmatched Transactions', 'Queue of unmatched or suspicious bank movements.'],
    ['bank-transfers', 'Bank Transfers', 'Transfer between bank/cash accounts with contra linkage.'],
    ['cash-book-petty-cash', 'Cash Book & Petty Cash', 'Cash receipts, payments, imprest and physical verification.'],
    ['upi-gateway-settlement', 'UPI / Gateway Settlement', 'Gateway collection, fees, settlement and bank mapping.'],
  ]),
  moduleGroup('accounting-books', 'Accounting & Books', 'Double-entry books and control accounts.', [
    ['master-general-ledger', 'Master General Ledger', 'Account-wise debit-credit journal and running balance.'],
    ['chart-of-accounts', 'Chart of Accounts', 'Account tree, groups, nature, tax treatment and active status.'],
    ['day-book', 'Day Book', 'Chronological vouchers and journal activity for a selected period.'],
    ['journal-entries', 'Journal Entries', 'Manual adjustment journals with debit-credit validation.'],
    ['payment-vouchers', 'Payment Vouchers', 'Payment voucher creation, approval and allocation.'],
    ['receipt-vouchers', 'Receipt Vouchers', 'Receipt voucher creation, allocation and deposit mapping.'],
    ['contra-adjustment-vouchers', 'Contra & Adjustment Vouchers', 'Cash/bank contra and non-cash adjustments.'],
    ['trial-balance', 'Trial Balance', 'Opening, movement and closing debit-credit totals.'],
    ['suspense-account', 'Suspense Account', 'Unclassified entries with resolution and ageing.'],
    ['opening-balances', 'Opening Balances', 'Financial-year opening balances with import and approval.'],
  ]),
  moduleGroup('expenses-assets', 'Expenses & Assets', 'Operating costs, assets and amortisation.', [
    ['expense-register', 'Expense Register', 'Existing expense/transaction register with filters and export.', '/admin/finance/expenses'],
    ['add-expense', 'Add Expense', 'Existing manual debit entry flow with validation.', '/admin/finance/expenses'],
    ['vendor-bills', 'Vendor Bills', 'Vendor bill capture, due date, approval and payment linkage.'],
    ['recurring-expenses', 'Recurring Expenses', 'Repeat expense schedule, generation and exception handling.', '/admin/recurrence'],
    ['employee-reimbursements', 'Employee Reimbursements', 'Claims, receipts, approval and payout.'],
    ['fixed-assets', 'Fixed Assets', 'Asset register, capitalisation, location and disposal.'],
    ['depreciation', 'Depreciation', 'Method, useful life, period charge and asset-wise schedule.'],
    ['prepaid-expenses', 'Prepaid Expenses', 'Prepaid balance and periodic expense recognition.'],
  ]),
  moduleGroup('payroll', 'Payroll', 'Salary processing and employee settlements.', [
    ['employee-salary', 'Employee Salary', 'Employee-wise salary master and monthly payable.'],
    ['salary-structure', 'Salary Structure', 'Earnings, deductions, allowances and effective dates.'],
    ['payroll-processing', 'Payroll Processing', 'Payroll run, review, approval, posting and payslip generation.'],
    ['advances-deductions', 'Advances & Deductions', 'Employee advances, recoveries and deductions.'],
    ['payslips', 'Payslips', 'Secure payslip generation, download and delivery log.'],
    ['statutory-contributions', 'Statutory Contributions', 'PF/ESI/PT and other applicable contribution tracking.'],
    ['full-final-settlement', 'Full & Final Settlement', 'Exit dues, notice adjustment, leave and final payment.'],
  ]),
  moduleGroup('taxation-compliance', 'Taxation & Compliance', 'GST, TDS, TCS and statutory controls.', [
    ['gst-dashboard', 'GST Dashboard', 'Taxable turnover, output/input tax and filing readiness.'],
    ['sales-purchase-gst-register', 'Sales & Purchase GST Register', 'Invoice-level GST data with export and validation.'],
    ['gst-returns-reconciliation', 'GST Returns & Reconciliation', 'Books vs portal data, mismatches and resolution status.'],
    ['input-tax-credit', 'Input Tax Credit', 'Eligible, ineligible, claimed and pending ITC.'],
    ['e-invoice-eway-bill', 'E-Invoice / E-Way Bill', 'IRN/EWB status, errors, cancellation and document links.'],
    ['tds-management', 'TDS Management', 'Deductee, section, deduction, deposit and certificate status.'],
    ['tcs-management', 'TCS Management', 'Collection, rate, deposit and return status.'],
    ['tax-payments-challans', 'Tax Payments & Challans', 'Challan register, payment proof and reconciliation.'],
    ['income-tax-provisions', 'Income Tax & Provisions', 'Provision entries, advance tax and assessment documents.'],
  ]),
  moduleGroup('financial-reports', 'Financial Reports', 'Management and statutory reports.', [
    ['profit-loss', 'Profit & Loss', 'Income, direct cost, operating expense and net profit.'],
    ['balance-sheet', 'Balance Sheet', 'Assets, liabilities and equity at a selected date.'],
    ['cash-flow-statement', 'Cash Flow Statement', 'Operating, investing and financing cash flows.'],
    ['revenue-purchase-reports', 'Revenue & Purchase Reports', 'Period, party, vehicle and category comparisons.'],
    ['vehicle-profitability', 'Vehicle Profitability', 'Vehicle-wise gross margin, net margin and ROI.'],
    ['expense-margin-analysis', 'Expense & Margin Analysis', 'Expense mix, margin leakage and trend analysis.'],
    ['receivables-payables-report', 'Receivables / Payables', 'Outstanding, ageing, collection and payment analysis.'],
    ['bank-cash-reports', 'Bank & Cash Reports', 'Account-wise movement, balances and reconciliation summary.'],
    ['tax-reports', 'Tax Reports', 'GST/TDS/TCS and tax payment reporting.'],
  ]),
  moduleGroup('ca-audit-workspace', 'CA & Audit Workspace', 'Close, audit and document collaboration.', [
    ['ca-dashboard', 'CA Dashboard', 'Closing progress, exceptions, documents and questions.'],
    ['document-vault', 'Document Vault', 'Organised document storage with access, version and expiry.'],
    ['monthly-closing', 'Monthly Closing', 'Period checklist, lock, review and sign-off.'],
    ['financial-year-closing', 'Financial Year Closing', 'Year-end close, carry-forward and approval gates.'],
    ['audit-trail', 'Audit Trail', 'Immutable user/action/entity history and export.'],
    ['ca-queries-checklist', 'CA Queries & Checklist', 'Queries, evidence, owner, due date and resolution.'],
    ['accounting-review', 'Accounting Review', 'Review queue for journals, ledgers and exceptions.'],
    ['import-export', 'Import / Export', 'Controlled data exchange with templates and validation.'],
    ['import-bank-statements', 'Import Bank Statements', 'Bank statement import and batch history.', '/admin/finance/expenses'],
    ['import-opening-balances', 'Import Opening Balances', 'Opening balance template, preview and approval.'],
    ['import-transactions', 'Import Transactions', 'Transaction template, duplicate handling and error report.'],
    ['tally-accounting-export', 'Tally / Accounting Export', 'Mapped export with period and account validation.'],
    ['download-reports', 'Download Reports', 'Permission-controlled PDF/XLS/CSV report downloads.'],
    ['bulk-upload-history', 'Bulk Upload History', 'Batch status, row counts, errors and re-download.'],
  ]),
  moduleGroup('finance-settings', 'Finance Settings', 'Configuration and governance.', [
    ['company-financial-profile', 'Company Financial Profile', 'Legal name, GST, PAN, address, bank and invoice identity.'],
    ['financial-year-periods', 'Financial Year & Periods', 'Year setup, period open/close and lock rules.'],
    ['account-ledger-masters', 'Account & Ledger Masters', 'Parties, accounts, ledgers, tax and opening setup.'],
    ['voucher-numbering', 'Voucher Numbering', 'Series, prefixes, reset policy and duplicate prevention.'],
    ['tax-configurations', 'Tax Configurations', 'GST/TDS/TCS rates, sections, applicability and effective dates.'],
    ['cost-centres', 'Cost Centres', 'Branch, department, vehicle and project cost allocation.'],
    ['roles-permissions', 'Roles & Permissions', 'Module/action access, field visibility and approval limits.'],
    ['automation-approval-rules', 'Automation & Approval Rules', 'Posting, reminders, approval thresholds and escalation.'],
    ['integrations-notifications', 'Integrations & Notifications', 'Bank, GST, Tally, email, WhatsApp and notification settings.'],
  ]),
];

export const financeWorkspaceTabs = defaultTabs;

export const financeWorkspaceModules = financeWorkspaceGroups.flatMap((group) =>
  group.modules.map((module) => ({ ...module, groupKey: group.key, groupLabel: group.label })),
);

export const getFinanceWorkspaceModule = (key: string | null | undefined) =>
  financeWorkspaceModules.find((module) => module.key === key) || financeWorkspaceModules[0];

// Opening the workspace needs at least one finance-workspace key. The legacy finance.read /
// finance.manage keys only cover the old Expenses page and deliberately do not open it.
export const FINANCE_WORKSPACE_VIEW_PERMISSIONS = Array.from(new Set([
  ...financeWorkspaceGroups.flatMap((group) => group.permissions),
  'fh.approve',
]));

export const getVisibleFinanceWorkspaceGroups = (
  userPermissions: string[] | undefined,
  hasFullAccess: boolean,
) => {
  if (hasFullAccess || userPermissions?.includes('ALL_ACCESS')) return financeWorkspaceGroups;
  const granted = new Set(userPermissions || []);
  return financeWorkspaceGroups.filter((group) => group.permissions.some((permission) => granted.has(permission)));
};
