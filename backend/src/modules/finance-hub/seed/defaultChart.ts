import type { FinAccountKind, FinAccountNature, FinBalanceSide } from '@prisma/client';

// Default chart of accounts for a used construction-equipment dealer (docs/finance-hub/01 §3).
// Installing it is idempotent: rows are matched by code and existing rows are never changed.
// systemKey is the stable handle automatic posting uses; rename the account freely, keep the key.

export type DefaultGroup = {
  code: string;
  name: string;
  nature: FinAccountNature;
  parentCode?: string;
  reportLine?: string;
};

export type DefaultAccount = {
  code: string;
  name: string;
  groupCode: string;
  kind?: FinAccountKind;
  normalBalance: FinBalanceSide;
  systemKey?: string;
  manual?: boolean;
  party?: boolean;
  vehicle?: boolean;
  gstRate?: number;
};

export const DEFAULT_GROUPS: DefaultGroup[] = [
  { code: '1000', name: 'Assets', nature: 'ASSET' },
  { code: '1100', name: 'Fixed Assets', nature: 'ASSET', parentCode: '1000', reportLine: 'Property, Plant and Equipment' },
  { code: '1200', name: 'Current Assets', nature: 'ASSET', parentCode: '1000' },
  { code: '1205', name: 'Inventories', nature: 'ASSET', parentCode: '1200', reportLine: 'Inventories' },
  { code: '1220', name: 'Trade Receivables', nature: 'ASSET', parentCode: '1200', reportLine: 'Trade Receivables' },
  { code: '1230', name: 'Loans & Advances', nature: 'ASSET', parentCode: '1200', reportLine: 'Short-term Loans and Advances' },
  { code: '1260', name: 'Duties & Taxes Receivable', nature: 'ASSET', parentCode: '1200', reportLine: 'Other Current Assets' },
  { code: '1290', name: 'Clearing Accounts', nature: 'ASSET', parentCode: '1200', reportLine: 'Other Current Assets' },
  { code: '1300', name: 'Cash & Bank', nature: 'ASSET', parentCode: '1000', reportLine: 'Cash and Cash Equivalents' },
  { code: '1400', name: 'Suspense', nature: 'ASSET', parentCode: '1000', reportLine: 'Other Current Assets' },
  { code: '2000', name: 'Liabilities', nature: 'LIABILITY' },
  { code: '2100', name: 'Current Liabilities', nature: 'LIABILITY', parentCode: '2000' },
  { code: '2110', name: 'Trade Payables', nature: 'LIABILITY', parentCode: '2100', reportLine: 'Trade Payables' },
  { code: '2120', name: 'Advances & Deposits Received', nature: 'LIABILITY', parentCode: '2100', reportLine: 'Other Current Liabilities' },
  { code: '2140', name: 'Duties & Taxes Payable', nature: 'LIABILITY', parentCode: '2100', reportLine: 'Other Current Liabilities' },
  { code: '2160', name: 'Payroll Liabilities', nature: 'LIABILITY', parentCode: '2100', reportLine: 'Other Current Liabilities' },
  { code: '2170', name: 'Provisions', nature: 'LIABILITY', parentCode: '2100', reportLine: 'Short-term Provisions' },
  { code: '2200', name: 'Borrowings', nature: 'LIABILITY', parentCode: '2000', reportLine: 'Borrowings' },
  { code: '3000', name: 'Equity', nature: 'EQUITY', reportLine: 'Equity' },
  { code: '4000', name: 'Income', nature: 'INCOME' },
  { code: '4100', name: 'Revenue from Operations', nature: 'INCOME', parentCode: '4000', reportLine: 'Revenue from Operations' },
  { code: '4500', name: 'Other Income', nature: 'INCOME', parentCode: '4000', reportLine: 'Other Income' },
  { code: '5000', name: 'Cost of Sales', nature: 'EXPENSE', reportLine: 'Cost of Vehicles Sold' },
  { code: '6000', name: 'Operating Expenses', nature: 'EXPENSE', reportLine: 'Other Expenses' },
  { code: '6100', name: 'Employee Benefit Expenses', nature: 'EXPENSE', parentCode: '6000', reportLine: 'Employee Benefits Expense' },
  { code: '6900', name: 'Depreciation & Amortisation', nature: 'EXPENSE', parentCode: '6000', reportLine: 'Depreciation and Amortisation' },
];

const asset = (code: string, name: string, groupCode: string, extra: Partial<DefaultAccount> = {}): DefaultAccount =>
  ({ code, name, groupCode, normalBalance: 'DR', ...extra });
const liability = (code: string, name: string, groupCode: string, extra: Partial<DefaultAccount> = {}): DefaultAccount =>
  ({ code, name, groupCode, normalBalance: 'CR', ...extra });

export const DEFAULT_ACCOUNTS: DefaultAccount[] = [
  asset('1110', 'Computers & Peripherals', '1100', { kind: 'FIXED_ASSET' }),
  asset('1120', 'Furniture & Fixtures', '1100', { kind: 'FIXED_ASSET' }),
  asset('1130', 'Office Equipment', '1100', { kind: 'FIXED_ASSET' }),
  asset('1140', 'Vehicles (Own Use)', '1100', { kind: 'FIXED_ASSET' }),
  asset('1150', 'Plant & Machinery', '1100', { kind: 'FIXED_ASSET' }),
  liability('1190', 'Accumulated Depreciation', '1100', { kind: 'ACCUMULATED_DEPRECIATION', systemKey: 'ACCUMULATED_DEPRECIATION', manual: false }),

  asset('1210', 'Vehicle Stock-in-Trade', '1205', { kind: 'STOCK', systemKey: 'VEHICLE_STOCK', vehicle: true }),
  asset('1215', 'Exchange Vehicles Received', '1205', { kind: 'STOCK', systemKey: 'EXCHANGE_VEHICLE_STOCK', vehicle: true }),

  asset('1221', 'Sundry Debtors (Customers)', '1220', { kind: 'PARTY_CONTROL', systemKey: 'DEBTORS_CONTROL', party: true }),
  asset('1225', 'Partner Receivables', '1220', { kind: 'PARTY_CONTROL', systemKey: 'PARTNER_RECEIVABLES', party: true }),

  asset('1231', 'Advances to Sellers', '1230', { kind: 'PARTY_CONTROL', systemKey: 'SELLER_ADVANCES', party: true }),
  asset('1240', 'Employee Advances', '1230', { systemKey: 'EMPLOYEE_ADVANCES', party: true }),
  asset('1250', 'Prepaid Expenses', '1230', { kind: 'PREPAID', systemKey: 'PREPAID_EXPENSES' }),
  asset('1251', 'Prepaid API Wallet', '1230', { kind: 'PREPAID', systemKey: 'PREPAID_API_WALLET' }),
  asset('1280', 'Security Deposits Given', '1230'),

  asset('1261', 'GST Input - CGST', '1260', { kind: 'TAX', systemKey: 'GST_INPUT_CGST', manual: false }),
  asset('1262', 'GST Input - SGST', '1260', { kind: 'TAX', systemKey: 'GST_INPUT_SGST', manual: false }),
  asset('1263', 'GST Input - IGST', '1260', { kind: 'TAX', systemKey: 'GST_INPUT_IGST', manual: false }),
  asset('1265', 'GST Input - Ineligible (Holding)', '1260', { kind: 'TAX', systemKey: 'GST_INPUT_INELIGIBLE' }),
  asset('1270', 'TDS Receivable', '1260', { kind: 'TAX', systemKey: 'TDS_RECEIVABLE' }),
  asset('1271', 'TCS Receivable', '1260', { kind: 'TAX', systemKey: 'TCS_RECEIVABLE' }),
  asset('1272', 'Advance Tax', '1260', { kind: 'TAX', systemKey: 'ADVANCE_TAX' }),

  asset('1291', 'Razorpay Clearing', '1290', { kind: 'GATEWAY_CLEARING', systemKey: 'GATEWAY_RAZORPAY' }),
  asset('1292', 'PhonePe Clearing', '1290', { kind: 'GATEWAY_CLEARING', systemKey: 'GATEWAY_PHONEPE' }),
  asset('1293', 'UPI Clearing', '1290', { kind: 'GATEWAY_CLEARING', systemKey: 'GATEWAY_UPI' }),
  asset('1295', 'Exchange Clearing', '1290', { kind: 'CLEARING', systemKey: 'EXCHANGE_CLEARING', vehicle: true }),
  asset('1296', 'Vehicle Expense Clearing', '1290', { kind: 'CLEARING', systemKey: 'VEHICLE_EXPENSE_CLEARING', vehicle: true }),

  asset('1350', 'Cash in Hand', '1300', { kind: 'CASH', systemKey: 'CASH_IN_HAND' }),
  asset('1401', 'Suspense Account', '1400', { kind: 'SUSPENSE', systemKey: 'SUSPENSE' }),

  liability('2111', 'Sundry Creditors (Sellers & Vendors)', '2110', { kind: 'PARTY_CONTROL', systemKey: 'CREDITORS_CONTROL', party: true }),
  liability('2115', 'Partner Payables', '2110', { kind: 'PARTY_CONTROL', systemKey: 'PARTNER_PAYABLES', party: true }),
  liability('2116', 'Broker & Agent Payables', '2110', { kind: 'PARTY_CONTROL', systemKey: 'BROKER_PAYABLES', party: true }),
  liability('2180', 'Consignment Payable', '2110', { kind: 'PARTY_CONTROL', systemKey: 'CONSIGNMENT_PAYABLE', party: true }),

  liability('2121', 'Customer Advances', '2120', { kind: 'PARTY_CONTROL', systemKey: 'CUSTOMER_ADVANCES', party: true }),
  liability('2130', 'Partner Security Deposits', '2120', { kind: 'PARTY_CONTROL', systemKey: 'PARTNER_SECURITY_DEPOSITS', party: true }),

  liability('2141', 'GST Output - CGST', '2140', { kind: 'TAX', systemKey: 'GST_OUTPUT_CGST', manual: false }),
  liability('2142', 'GST Output - SGST', '2140', { kind: 'TAX', systemKey: 'GST_OUTPUT_SGST', manual: false }),
  liability('2143', 'GST Output - IGST', '2140', { kind: 'TAX', systemKey: 'GST_OUTPUT_IGST', manual: false }),
  liability('2145', 'GST Payable (Reverse Charge)', '2140', { kind: 'TAX', systemKey: 'GST_RCM_PAYABLE' }),
  liability('2150', 'TDS Payable', '2140', { kind: 'TAX', systemKey: 'TDS_PAYABLE' }),
  liability('2155', 'TCS Payable', '2140', { kind: 'TAX', systemKey: 'TCS_PAYABLE' }),

  liability('2161', 'Salary Payable', '2160', { systemKey: 'SALARY_PAYABLE' }),
  liability('2162', 'PF Payable', '2160', { systemKey: 'PF_PAYABLE' }),
  liability('2163', 'ESI Payable', '2160', { systemKey: 'ESI_PAYABLE' }),
  liability('2164', 'Professional Tax Payable', '2160', { systemKey: 'PT_PAYABLE' }),
  liability('2165', 'Reimbursements Payable', '2160', { systemKey: 'REIMBURSEMENTS_PAYABLE', party: true }),

  liability('2171', 'Expenses Payable', '2170', { systemKey: 'EXPENSES_PAYABLE' }),
  liability('2175', 'Provision for Income Tax', '2170', { systemKey: 'INCOME_TAX_PROVISION' }),

  liability('2210', 'Secured Loans', '2200'),
  liability('2220', 'Unsecured Loans', '2200'),
  liability('2230', 'Loans from Directors / Partners', '2200'),

  liability('3100', 'Capital Account', '3000', { kind: 'EQUITY', systemKey: 'CAPITAL' }),
  asset('3200', 'Drawings', '3000', { kind: 'EQUITY', systemKey: 'DRAWINGS' }),
  liability('3300', 'Retained Earnings', '3000', { kind: 'EQUITY', systemKey: 'RETAINED_EARNINGS', manual: false }),
  liability('3900', 'Opening Balance Difference', '3000', { kind: 'EQUITY', systemKey: 'OPENING_DIFFERENCE', manual: false }),

  liability('4101', 'Vehicle Sales (Margin Scheme)', '4100', { systemKey: 'VEHICLE_SALES_MARGIN', vehicle: true }),
  liability('4110', 'Vehicle Sales (Regular GST)', '4100', { systemKey: 'VEHICLE_SALES_REGULAR', vehicle: true, gstRate: 18 }),
  liability('4200', 'Brokerage Income', '4100', { systemKey: 'BROKERAGE_INCOME', gstRate: 18 }),
  liability('4210', 'Consignment Commission Income', '4100', { systemKey: 'CONSIGNMENT_COMMISSION_INCOME', gstRate: 18 }),
  liability('4300', 'Subscription Income (Customer Prime)', '4100', { systemKey: 'SUBSCRIPTION_INCOME', gstRate: 18 }),
  liability('4400', 'Listing & Service Fees', '4100', { systemKey: 'LISTING_FEES_INCOME', gstRate: 18 }),

  liability('4501', 'Interest Income', '4500'),
  liability('4502', 'Discount Received', '4500'),
  liability('4503', 'Write-back of Payables', '4500', { systemKey: 'WRITE_BACK' }),
  liability('4504', 'Profit on Sale of Fixed Assets', '4500', { systemKey: 'ASSET_SALE_PROFIT' }),
  liability('4590', 'Round Off', '4500', { kind: 'ROUND_OFF', systemKey: 'ROUND_OFF' }),

  asset('5100', 'Cost of Vehicles Sold', '5000', { systemKey: 'COGS_VEHICLES', vehicle: true }),
  asset('5201', 'Vehicle Transport', '5000', { vehicle: true }),
  asset('5202', 'Vehicle Paperwork', '5000', { vehicle: true }),
  asset('5203', 'Vehicle RTO Work', '5000', { vehicle: true }),
  asset('5204', 'Vehicle Repairs & Refurbishment', '5000', { vehicle: true }),
  asset('5209', 'Other Direct Vehicle Costs', '5000', { vehicle: true }),
  asset('5300', 'Brokerage / Commission Paid', '5000', { systemKey: 'BROKERAGE_EXPENSE' }),
  asset('5310', 'Partner Share of Profit', '5000', { systemKey: 'PARTNER_SHARE_EXPENSE' }),

  asset('6101', 'Salaries & Wages', '6100', { systemKey: 'SALARY_EXPENSE' }),
  asset('6110', 'Employer PF Contribution', '6100', { systemKey: 'EMPLOYER_PF' }),
  asset('6120', 'Employer ESI Contribution', '6100', { systemKey: 'EMPLOYER_ESI' }),
  asset('6130', 'Staff Welfare', '6100'),

  asset('6200', 'Rent', '6000', { gstRate: 18 }),
  asset('6210', 'Electricity & Water', '6000'),
  asset('6220', 'Internet & Telephone', '6000', { gstRate: 18 }),
  asset('6300', 'Travel', '6000'),
  asset('6310', 'Fuel', '6000'),
  asset('6320', 'Vehicle Running Expense (Own Vehicles)', '6000'),
  asset('6400', 'Office Expense', '6000'),
  asset('6410', 'Printing & Stationery', '6000'),
  asset('6420', 'Software & Subscriptions', '6000', { gstRate: 18 }),
  asset('6500', 'Verification API Expense', '6000', { systemKey: 'API_EXPENSE' }),
  asset('6600', 'Marketing & Advertising', '6000', { gstRate: 18 }),
  asset('6700', 'Bank Charges', '6000', { systemKey: 'BANK_CHARGES' }),
  asset('6710', 'Payment Gateway Charges', '6000', { systemKey: 'GATEWAY_CHARGES', gstRate: 18 }),
  asset('6800', 'Professional Fees', '6000', { gstRate: 18 }),
  asset('6901', 'Depreciation', '6900', { systemKey: 'DEPRECIATION', manual: false }),
  asset('6910', 'Bad Debts Written Off', '6000', { systemKey: 'BAD_DEBTS' }),
  asset('6930', 'Discount Allowed', '6000', { systemKey: 'DISCOUNT_ALLOWED' }),
  asset('6940', 'Loss on Sale / Discard of Fixed Assets', '6000', { systemKey: 'ASSET_SALE_LOSS' }),
  asset('6920', 'Interest & Penalty', '6000'),
  asset('6990', 'Miscellaneous Expenses', '6000', { systemKey: 'MISC_EXPENSE' }),
];

// Old Expenses-page categories → ledger code. "Tax" is left unmapped on purpose: it can be
// GST, TDS or income tax, so the accountant chooses when booking.
export const DEFAULT_CATEGORY_MAP: Record<string, string> = {
  'Office Expense': '6400',
  Travel: '6300',
  Fuel: '6310',
  Rent: '6200',
  Utilities: '6210',
  Salary: '6101',
  'Bank Charges': '6700',
  'Vehicle Expense': '6320',
  Miscellaneous: '6990',
  'Imported / Uncategorized': '1401',
};
