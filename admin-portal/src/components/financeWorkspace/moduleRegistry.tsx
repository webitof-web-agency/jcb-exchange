'use client';

import dynamic from 'next/dynamic';
import type { ComponentType } from 'react';
import { LoadingState, Panel } from './ui';

// Workspace module key (src/lib/financeWorkspace.ts) → implemented screen. Modules that are
// not listed here keep showing the planned-scope placeholder.

const loading = () => <Panel><LoadingState /></Panel>;

const CompanyProfileModule = dynamic(() => import('./CompanyProfileModule'), { loading });
const FinancialYearsModule = dynamic(() => import('./FinancialYearsModule'), { loading });
const VoucherNumberingModule = dynamic(() => import('./VoucherNumberingModule'), { loading });
const ChartOfAccountsModule = dynamic(() => import('./ChartOfAccountsModule'), { loading });
const LedgerMastersModule = dynamic(() => import('./LedgerMastersModule'), { loading });
const CostCentresModule = dynamic(() => import('./CostCentresModule'), { loading });
const BankAccountsModule = dynamic(() => import('./BankAccountsModule'), { loading });
const OpeningBalancesModule = dynamic(() => import('./OpeningBalancesModule'), { loading });
const PartyMasterModule = dynamic(() => import('./PartyMasterModule'), { loading });
const VouchersModule = dynamic(() => import('./VouchersModule'), { loading });
const GeneralLedgerModule = dynamic(() => import('./GeneralLedgerModule'), { loading });
const TrialBalanceModule = dynamic(() => import('./TrialBalanceModule'), { loading });
const SuspenseModule = dynamic(() => import('./SuspenseModule'), { loading });
const AuditTrailModule = dynamic(() => import('./AuditTrailModule'), { loading });
const AutomationSettingsModule = dynamic(() => import('./AutomationSettingsModule'), { loading });
const VehicleRegisterModule = dynamic(() => import('./VehicleRegisterModule'), { loading });
const VehicleLedgerModule = dynamic(() => import('./VehicleLedgerModule'), { loading });
const LedgerBalancesModule = dynamic(() => import('./LedgerBalancesModule'), { loading });
const ReceiptsRegisterModule = dynamic(() => import('./ReceiptsRegisterModule'), { loading });
const SalesInvoicesModule = dynamic(() => import('./SalesInvoicesModule'), { loading });
const DocumentsModule = dynamic(() => import('./DocumentsModule'), { loading });
const DealTermsListModule = dynamic(() => import('./DealTermsListModule'), { loading });
const SettlementsModule = dynamic(() => import('./SettlementsModule'), { loading });
const BrokerageIncomeModule = dynamic(() => import('./BrokerageIncomeModule'), { loading });
const NotesModule = dynamic(() => import('./NotesModule'), { loading });
const DuesModule = dynamic(() => import('./DuesModule'), { loading });
const AgingModule = dynamic(() => import('./DuesModule').then((module) => module.AgingModule), { loading });
const PartyStatementsModule = dynamic(() => import('./ReceivablesModules').then((module) => module.PartyStatementsModule), { loading });
const AdvancesModule = dynamic(() => import('./ReceivablesModules').then((module) => module.AdvancesModule), { loading });
const SchedulesModule = dynamic(() => import('./ReceivablesModules').then((module) => module.SchedulesModule), { loading });
const FollowUpsModule = dynamic(() => import('./ReceivablesModules').then((module) => module.FollowUpsModule), { loading });
const WriteOffsModule = dynamic(() => import('./ReceivablesModules').then((module) => module.WriteOffsModule), { loading });
const BankReconModule = dynamic(() => import('./BankingModules').then((module) => module.BankReconModule), { loading });
const UnmatchedModule = dynamic(() => import('./BankingModules').then((module) => module.UnmatchedModule), { loading });
const StatementImportsModule = dynamic(() => import('./BankingModules').then((module) => module.StatementImportsModule), { loading });
const CashBookModule = dynamic(() => import('./BankingModules').then((module) => module.CashBookModule), { loading });
const GatewayModule = dynamic(() => import('./BankingModules').then((module) => module.GatewayModule), { loading });
const ExpenseRegisterModule = dynamic(() => import('./ExpensesModules').then((module) => module.ExpenseRegisterModule), { loading });
const RecurringExpensesModule = dynamic(() => import('./ExpensesModules').then((module) => module.RecurringExpensesModule), { loading });
const ReimbursementsModule = dynamic(() => import('./ExpensesModules').then((module) => module.ReimbursementsModule), { loading });
const FixedAssetsModule = dynamic(() => import('./ExpensesModules').then((module) => module.FixedAssetsModule), { loading });
const PeriodicRunPanel = dynamic(() => import('./ExpensesModules').then((module) => module.PeriodicRunPanel), { loading });
const PrepaidExpensesModule = dynamic(() => import('./ExpensesModules').then((module) => module.PrepaidExpensesModule), { loading });
const GstDashboardModule = dynamic(() => import('./TaxModules').then((module) => module.GstDashboardModule), { loading });
const GstRegisterModule = dynamic(() => import('./TaxModules').then((module) => module.GstRegisterModule), { loading });
const GstReturnsModule = dynamic(() => import('./TaxModules').then((module) => module.GstReturnsModule), { loading });
const InputTaxCreditModule = dynamic(() => import('./TaxModules').then((module) => module.InputTaxCreditModule), { loading });
const EInvoiceModule = dynamic(() => import('./TaxModules').then((module) => module.EInvoiceModule), { loading });
const WithholdingModule = dynamic(() => import('./TaxModules').then((module) => module.WithholdingModule), { loading });
const ChallansModule = dynamic(() => import('./TaxModules').then((module) => module.ChallansModule), { loading });
const IncomeTaxModule = dynamic(() => import('./TaxModules').then((module) => module.IncomeTaxModule), { loading });
const EmployeeSalaryModule = dynamic(() => import('./PayrollModules').then((module) => module.EmployeeSalaryModule), { loading });
const SalaryStructureModule = dynamic(() => import('./PayrollModules').then((module) => module.SalaryStructureModule), { loading });
const PayrollProcessingModule = dynamic(() => import('./PayrollModules').then((module) => module.PayrollProcessingModule), { loading });
const AdvancesDeductionsModule = dynamic(() => import('./PayrollModules').then((module) => module.AdvancesDeductionsModule), { loading });
const PayslipsModule = dynamic(() => import('./PayrollModules').then((module) => module.PayslipsModule), { loading });
const StatutoryContributionsModule = dynamic(() => import('./PayrollModules').then((module) => module.StatutoryContributionsModule), { loading });
const FullFinalModule = dynamic(() => import('./PayrollModules').then((module) => module.FullFinalModule), { loading });
const ProfitLossModule = dynamic(() => import('./ReportModules').then((module) => module.ProfitLossModule), { loading });
const BalanceSheetModule = dynamic(() => import('./ReportModules').then((module) => module.BalanceSheetModule), { loading });
const CashFlowStatementModule = dynamic(() => import('./ReportModules').then((module) => module.CashFlowStatementModule), { loading });
const RevenuePurchaseModule = dynamic(() => import('./ReportModules').then((module) => module.RevenuePurchaseModule), { loading });
const ExpenseMarginModule = dynamic(() => import('./ReportModules').then((module) => module.ExpenseMarginModule), { loading });
const BankCashReportModule = dynamic(() => import('./ReportModules').then((module) => module.BankCashReportModule), { loading });
const TaxReportsModule = dynamic(() => import('./ReportModules').then((module) => module.TaxReportsModule), { loading });
const FinancialOverviewModule = dynamic(() => import('./ReportModules').then((module) => module.FinancialOverviewModule), { loading });
const CashFlowOverviewModule = dynamic(() => import('./ReportModules').then((module) => module.CashFlowOverviewModule), { loading });
const AlertsPanel = dynamic(() => import('./ReportModules').then((module) => module.AlertsPanel), { loading });

const CustomerParties = () => <PartyMasterModule types={['CUSTOMER']} title="Customers" />;
const PartnerParties = () => <PartyMasterModule types={['PARTNER']} title="Partners" />;
const SellerVendorParties = () => <PartyMasterModule types={['SELLER', 'VENDOR']} title="Sellers & vendors" />;
const BrokerAgentParties = () => <PartyMasterModule types={['BROKER', 'AGENT']} title="Brokers & agents" />;

const JournalVouchers = () => <VouchersModule title="Journal entries" description="Non-cash adjustments between ledgers. Bank and cash movements use payment, receipt or contra vouchers." types={['JOURNAL']} createTypes={['JOURNAL']} />;
const PaymentVouchers = () => <VouchersModule title="Payment vouchers" description="Money paid out of a bank or cash account." types={['PAYMENT']} createTypes={['PAYMENT']} />;
const ReceiptVouchers = () => <VouchersModule title="Receipt vouchers" description="Money received into a bank or cash account." types={['RECEIPT']} createTypes={['RECEIPT']} />;
const ContraVouchers = () => <VouchersModule title="Contra & adjustment vouchers" description="Contra: cash deposits, withdrawals and transfers between own accounts. Adjustment: period-end reclassifications and accruals." types={['CONTRA', 'ADJUSTMENT']} createTypes={['CONTRA', 'ADJUSTMENT']} />;
const DayBook = () => <VouchersModule title="Day book" description="Every voucher in date order — manual and automatic, drafts to reversals." createTypes={['JOURNAL', 'PAYMENT', 'RECEIPT', 'CONTRA', 'ADJUSTMENT']} />;
const AllPurchases = () => <VehicleRegisterModule view="purchases" title="All purchases" />;
const VehiclePurchases = () => <VehicleRegisterModule view="purchases" />;
const AdditionalCosts = () => <VehicleRegisterModule view="costs" />;
const SellerAdvances = () => <LedgerBalancesModule systemKey="SELLER_ADVANCES" title="Seller advances" description="Money paid to sellers before the purchase was booked, still waiting to be adjusted. Adjustment happens automatically when the purchase is booked." />;
const AllSales = () => <VehicleRegisterModule view="sales" />;
const CostSheet = () => <VehicleRegisterModule view="costsheet" />;
const ProfitMargin = () => <VehicleRegisterModule view="profit" />;
const StockValuation = () => <VehicleRegisterModule view="stock" />;
const ExchangeTransactions = () => <VehicleRegisterModule view="exchange" />;
const PurchaseBills = () => <DocumentsModule title="Purchase bills & invoices" description="Supplier bills for expenses, services and assets (vehicle purchases come from Sold Vehicles). GST input credit, reverse charge and TDS are booked on posting." types={['PURCHASE_BILL']} createTypes={['PURCHASE_BILL']} />;
const PurchaseReturns = () => <DocumentsModule title="Purchase returns" description="Debit notes for goods returned to a supplier; they reduce what we owe and reverse the input GST." types={['DEBIT_NOTE']} createTypes={['DEBIT_NOTE']} reason="RETURN" />;
const SalesReturns = () => <DocumentsModule title="Sales returns & refunds" description="Credit notes for returns; they reduce what the customer owes and the output GST. Pay any refund with a payment voucher." types={['CREDIT_NOTE']} createTypes={['CREDIT_NOTE']} reason="RETURN" />;
const VirtualBankLedger = () => <BankReconModule types={['VIRTUAL']} title="HDFC virtual bank ledger" description="Virtual accounts (VAN) and their parent current account: credits from the statement, matched to receipts in the books. Live e-Collect / API feed needs bank credentials (off)." />;
const BankTransfers = () => <VouchersModule title="Bank transfers" description="Transfers between own bank, cash, wallet and gateway accounts (contra vouchers), including petty cash top-ups and cash deposits." types={['CONTRA']} createTypes={['CONTRA']} />;
const VendorBills = () => <DocumentsModule title="Vendor bills" description="Bills from vendors for services, supplies and assets with GST input credit, reverse charge and TDS. Pay them with a payment voucher or from Supplier Payables." types={['PURCHASE_BILL', 'DEBIT_NOTE']} createTypes={['PURCHASE_BILL']} />;
const DepreciationRuns = () => <PeriodicRunPanel kind="depreciation" />;
const TdsModule = () => <WithholdingModule kind="TDS" />;
const TcsModule = () => <WithholdingModule kind="TCS" />;
const AlertsAndApprovals = () => <div className="space-y-4"><AlertsPanel /><PendingApprovals /></div>;
const CustomerDues = () => <DuesModule side="RECEIVABLE" />;
const SupplierPayables = () => <DuesModule side="PAYABLE" />;
const ConsignmentDeals = () => <DealTermsListModule kind="consignment" />;
const PendingApprovals = () => <VouchersModule title="Pending approvals" description="Vouchers waiting for a checker. Open one to approve and post it, or reject it back to the maker with a reason." createTypes={[]} fixedStatuses={['PENDING_APPROVAL']} />;

export const financeWorkspaceScreens: Record<string, ComponentType> = {
  'company-financial-profile': CompanyProfileModule,
  'financial-year-periods': FinancialYearsModule,
  'voucher-numbering': VoucherNumberingModule,
  'chart-of-accounts': ChartOfAccountsModule,
  'account-ledger-masters': LedgerMastersModule,
  'cost-centres': CostCentresModule,
  'bank-accounts': BankAccountsModule,
  'opening-balances': OpeningBalancesModule,
  'customer-ledger': CustomerParties,
  'partner-ledger': PartnerParties,
  'seller-vendor-ledger': SellerVendorParties,
  'broker-agent-ledger': BrokerAgentParties,
  'alerts-pending-approvals': AlertsAndApprovals,
  'journal-entries': JournalVouchers,
  'payment-vouchers': PaymentVouchers,
  'receipt-vouchers': ReceiptVouchers,
  'contra-adjustment-vouchers': ContraVouchers,
  'day-book': DayBook,
  'master-general-ledger': GeneralLedgerModule,
  'trial-balance': TrialBalanceModule,
  'suspense-account': SuspenseModule,
  'audit-trail': AuditTrailModule,
  'automation-approval-rules': AutomationSettingsModule,
  'all-purchases': AllPurchases,
  'vehicle-purchase-list': VehiclePurchases,
  'additional-purchase-costs': AdditionalCosts,
  'seller-advances': SellerAdvances,
  'all-sales': AllSales,
  'sales-invoices': SalesInvoicesModule,
  'customer-receipts': ReceiptsRegisterModule,
  'vehicle-wise-ledger': VehicleLedgerModule,
  'vehicle-cost-sheet': CostSheet,
  'vehicle-profit-margin': ProfitMargin,
  'stock-valuation': StockValuation,
  'exchange-transactions': ExchangeTransactions,
  'purchase-bills-invoices': PurchaseBills,
  'purchase-returns': PurchaseReturns,
  'credit-debit-notes': NotesModule,
  'sales-returns-refunds': SalesReturns,
  'brokerage-other-income': BrokerageIncomeModule,
  'consignment-deals': ConsignmentDeals,
  'partner-commission-settlement': SettlementsModule,
  'party-statements': PartyStatementsModule,
  'party-advances-deposits': AdvancesModule,
  'customer-dues': CustomerDues,
  'supplier-partner-payables': SupplierPayables,
  'due-aging-reports': AgingModule,
  'payment-schedules': SchedulesModule,
  'follow-up-reminders': FollowUpsModule,
  'settlements-write-offs': WriteOffsModule,
  'bank-reconciliation': BankReconModule,
  'unmatched-transactions': UnmatchedModule,
  'hdfc-virtual-bank-ledger': VirtualBankLedger,
  'bank-statement-upload': StatementImportsModule,
  'bank-transfers': BankTransfers,
  'cash-book-petty-cash': CashBookModule,
  'upi-gateway-settlement': GatewayModule,
  'expense-register': ExpenseRegisterModule,
  'vendor-bills': VendorBills,
  'recurring-expenses': RecurringExpensesModule,
  'employee-reimbursements': ReimbursementsModule,
  'fixed-assets': FixedAssetsModule,
  depreciation: DepreciationRuns,
  'prepaid-expenses': PrepaidExpensesModule,
  'gst-dashboard': GstDashboardModule,
  'sales-purchase-gst-register': GstRegisterModule,
  'gst-returns-reconciliation': GstReturnsModule,
  'input-tax-credit': InputTaxCreditModule,
  'e-invoice-eway-bill': EInvoiceModule,
  'tds-management': TdsModule,
  'tcs-management': TcsModule,
  'tax-payments-challans': ChallansModule,
  'income-tax-provisions': IncomeTaxModule,
  'employee-salary': EmployeeSalaryModule,
  'salary-structure': SalaryStructureModule,
  'payroll-processing': PayrollProcessingModule,
  'advances-deductions': AdvancesDeductionsModule,
  payslips: PayslipsModule,
  'statutory-contributions': StatutoryContributionsModule,
  'full-final-settlement': FullFinalModule,
  'profit-loss': ProfitLossModule,
  'balance-sheet': BalanceSheetModule,
  'cash-flow-statement': CashFlowStatementModule,
  'revenue-purchase-reports': RevenuePurchaseModule,
  'vehicle-profitability': ProfitMargin,
  'expense-margin-analysis': ExpenseMarginModule,
  'receivables-payables-report': AgingModule,
  'bank-cash-reports': BankCashReportModule,
  'tax-reports': TaxReportsModule,
  'financial-overview': FinancialOverviewModule,
  'cash-flow-overview': CashFlowOverviewModule,
};
