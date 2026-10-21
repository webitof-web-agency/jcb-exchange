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

const CustomerParties = () => <PartyMasterModule types={['CUSTOMER']} title="Customers" />;
const PartnerParties = () => <PartyMasterModule types={['PARTNER']} title="Partners" />;
const SellerVendorParties = () => <PartyMasterModule types={['SELLER', 'VENDOR']} title="Sellers & vendors" />;
const BrokerAgentParties = () => <PartyMasterModule types={['BROKER', 'AGENT']} title="Brokers & agents" />;

const JournalVouchers = () => <VouchersModule title="Journal entries" description="Non-cash adjustments between ledgers. Bank and cash movements use payment, receipt or contra vouchers." types={['JOURNAL']} createTypes={['JOURNAL']} />;
const PaymentVouchers = () => <VouchersModule title="Payment vouchers" description="Money paid out of a bank or cash account." types={['PAYMENT']} createTypes={['PAYMENT']} />;
const ReceiptVouchers = () => <VouchersModule title="Receipt vouchers" description="Money received into a bank or cash account." types={['RECEIPT']} createTypes={['RECEIPT']} />;
const ContraVouchers = () => <VouchersModule title="Contra & adjustment vouchers" description="Contra: cash deposits, withdrawals and transfers between own accounts. Adjustment: period-end reclassifications and accruals." types={['CONTRA', 'ADJUSTMENT']} createTypes={['CONTRA', 'ADJUSTMENT']} />;
const DayBook = () => <VouchersModule title="Day book" description="Every voucher in date order — manual and automatic, drafts to reversals." createTypes={['JOURNAL', 'PAYMENT', 'RECEIPT', 'CONTRA', 'ADJUSTMENT']} />;
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
  'alerts-pending-approvals': PendingApprovals,
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
};
