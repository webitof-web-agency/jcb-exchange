import type { FinAccountKind, FinAccountNature } from '@prisma/client';

// Financial statement layout (pure): Schedule III style P&L and balance sheet, direct cash flow.

const round = (value: number) => Math.round(value * 100) / 100;

export type StatementAccount = { id: string; code: string; name: string; kind: FinAccountKind; systemKey: string | null; nature: FinAccountNature; reportLine: string | null; groupCode: string };
/** Dr-positive net movement or balance per account. */
export type Figures = Map<string, number>;

export const PL_INCOME_LINES = ['Revenue from Operations', 'Other Income'] as const;
export const PL_EXPENSE_LINES = ['Cost of Vehicles Sold', 'Employee Benefits Expense', 'Finance Costs', 'Depreciation and Amortisation', 'Other Expenses'] as const;

/** Report line of an account: its group's (inherited) line; income tax is its own line. */
export const lineOf = (account: StatementAccount) => {
  if (account.systemKey === 'INCOME_TAX_EXPENSE') return 'Tax Expense';
  return account.reportLine ?? (account.nature === 'INCOME' ? 'Other Income' : account.nature === 'EXPENSE' ? 'Other Expenses' : account.nature === 'EQUITY' ? 'Equity' : 'Other Current Assets');
};

type Line = { line: string; amount: number; accounts: Array<{ id: string; code: string; name: string; amount: number }> };

const collect = (accounts: StatementAccount[], figures: Figures, pick: (account: StatementAccount) => boolean, sign: 1 | -1) => {
  const lines = new Map<string, Line>();
  for (const account of accounts.filter(pick)) {
    const value = round((figures.get(account.id) ?? 0) * sign);
    if (!value) continue;
    const key = lineOf(account);
    const entry = lines.get(key) ?? { line: key, amount: 0, accounts: [] };
    entry.amount = round(entry.amount + value);
    entry.accounts.push({ id: account.id, code: account.code, name: account.name, amount: value });
    lines.set(key, entry);
  }
  for (const entry of lines.values()) entry.accounts.sort((a, b) => a.code.localeCompare(b.code));
  return lines;
};

const ordered = (lines: Map<string, Line>, order: readonly string[]) => [
  ...order.map((key) => lines.get(key) ?? { line: key, amount: 0, accounts: [] }),
  ...Array.from(lines.values()).filter((line) => !order.includes(line.line)),
];

export const buildProfitAndLoss = (accounts: StatementAccount[], movement: Figures) => {
  const income = ordered(collect(accounts, movement, (account) => account.nature === 'INCOME', -1), PL_INCOME_LINES);
  const expenses = ordered(collect(accounts, movement, (account) => account.nature === 'EXPENSE' && account.systemKey !== 'INCOME_TAX_EXPENSE', 1), PL_EXPENSE_LINES);
  const tax = collect(accounts, movement, (account) => account.systemKey === 'INCOME_TAX_EXPENSE', 1).get('Tax Expense') ?? { line: 'Tax Expense', amount: 0, accounts: [] };
  const totalIncome = round(income.reduce((sum, line) => sum + line.amount, 0));
  const totalExpenses = round(expenses.reduce((sum, line) => sum + line.amount, 0));
  const profitBeforeTax = round(totalIncome - totalExpenses);
  const revenue = income.find((line) => line.line === 'Revenue from Operations')?.amount ?? 0;
  const cogs = expenses.find((line) => line.line === 'Cost of Vehicles Sold')?.amount ?? 0;
  return {
    income, totalIncome, expenses, totalExpenses, profitBeforeTax, tax, profitAfterTax: round(profitBeforeTax - tax.amount),
    grossProfit: round(revenue - cogs), grossMarginPercent: revenue ? round(((revenue - cogs) / revenue) * 100) : null,
  };
};

export const BS_ASSET_LINES = ['Property, Plant and Equipment', 'Inventories', 'Trade Receivables', 'Cash and Cash Equivalents', 'Short-term Loans and Advances', 'Other Current Assets'] as const;
export const BS_LIABILITY_LINES = ['Borrowings', 'Trade Payables', 'Other Current Liabilities', 'Short-term Provisions'] as const;

/**
 * Balance sheet as of a date. Profit not yet closed to retained earnings is shown as
 * "Profit for the period" inside equity, so assets = equity + liabilities when the books balance.
 */
export const buildBalanceSheet = (accounts: StatementAccount[], balances: Figures) => {
  const assets = ordered(collect(accounts, balances, (account) => account.nature === 'ASSET', 1), BS_ASSET_LINES);
  const liabilities = ordered(collect(accounts, balances, (account) => account.nature === 'LIABILITY', -1), BS_LIABILITY_LINES);
  const equityAccounts = collect(accounts, balances, (account) => account.nature === 'EQUITY', -1).get('Equity') ?? { line: 'Equity', amount: 0, accounts: [] };
  const unclosedProfit = round(accounts.filter((account) => account.nature === 'INCOME' || account.nature === 'EXPENSE').reduce((sum, account) => sum - (balances.get(account.id) ?? 0), 0));
  const totalAssets = round(assets.reduce((sum, line) => sum + line.amount, 0));
  const totalLiabilities = round(liabilities.reduce((sum, line) => sum + line.amount, 0));
  const totalEquity = round(equityAccounts.amount + unclosedProfit);
  return {
    assets, totalAssets, liabilities, totalLiabilities,
    equity: { accounts: equityAccounts.accounts, profitForPeriod: unclosedProfit, total: totalEquity },
    totalEquityAndLiabilities: round(totalEquity + totalLiabilities),
    difference: round(totalAssets - totalEquity - totalLiabilities),
  };
};

export type CashCategory = 'OPERATING' | 'INVESTING' | 'FINANCING';

export const isCashEquivalent = (account: StatementAccount) => account.reportLine === 'Cash and Cash Equivalents';

export const cashCategory = (account: StatementAccount): CashCategory => {
  if (account.kind === 'FIXED_ASSET' || account.kind === 'ACCUMULATED_DEPRECIATION' || account.groupCode === '1100' || account.systemKey === 'ASSET_SALE_PROFIT' || account.systemKey === 'ASSET_SALE_LOSS') return 'INVESTING';
  if (account.nature === 'EQUITY' || account.reportLine === 'Borrowings') return 'FINANCING';
  return 'OPERATING';
};

/**
 * Direct method: in a voucher that moves cash, each non-cash line's (credit − debit) is exactly
 * the cash it explains, so summing those by category gives the cash flow without allocation.
 */
export const buildCashFlow = (accounts: Map<string, StatementAccount>, vouchers: Array<Array<{ accountId: string; debit: number; credit: number }>>, opening: number, closing: number) => {
  const buckets: Record<CashCategory, Map<string, { line: string; inflow: number; outflow: number }>> = { OPERATING: new Map(), INVESTING: new Map(), FINANCING: new Map() };
  for (const lines of vouchers) {
    const cashLines = lines.filter((line) => { const account = accounts.get(line.accountId); return account && isCashEquivalent(account); });
    if (!cashLines.length) continue;
    for (const line of lines) {
      const account = accounts.get(line.accountId);
      if (!account || isCashEquivalent(account)) continue;
      const cash = round(line.credit - line.debit);
      if (!cash) continue;
      const category = cashCategory(account);
      const key = account.nature === 'INCOME' || account.nature === 'EXPENSE' ? lineOf(account) : account.reportLine ?? account.name;
      const entry = buckets[category].get(key) ?? { line: key, inflow: 0, outflow: 0 };
      if (cash > 0) entry.inflow = round(entry.inflow + cash);
      else entry.outflow = round(entry.outflow - cash);
      buckets[category].set(key, entry);
    }
  }
  const sections = (Object.keys(buckets) as CashCategory[]).map((category) => {
    const lines = Array.from(buckets[category].values()).map((line) => ({ ...line, net: round(line.inflow - line.outflow) })).sort((a, b) => Math.abs(b.net) - Math.abs(a.net));
    return { category, lines, net: round(lines.reduce((sum, line) => sum + line.net, 0)) };
  });
  const net = round(sections.reduce((sum, section) => sum + section.net, 0));
  return { sections, net, opening: round(opening), closing: round(closing), difference: round(opening + net - closing) };
};
