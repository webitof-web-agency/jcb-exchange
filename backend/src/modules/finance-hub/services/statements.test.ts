import assert from 'node:assert/strict';
import test from 'node:test';
import { buildBalanceSheet, buildCashFlow, buildProfitAndLoss, type StatementAccount } from './statementsRules';

const account = (id: string, nature: StatementAccount['nature'], reportLine: string | null, extra: Partial<StatementAccount> = {}): StatementAccount => ({ id, code: id, name: id, kind: 'GENERAL', systemKey: null, nature, reportLine, groupCode: '0', ...extra });
const accounts = [
  account('bank', 'ASSET', 'Cash and Cash Equivalents', { kind: 'BANK' }),
  account('debtors', 'ASSET', 'Trade Receivables'),
  account('laptop', 'ASSET', 'Property, Plant and Equipment', { kind: 'FIXED_ASSET', groupCode: '1100' }),
  account('accdep', 'ASSET', 'Property, Plant and Equipment', { kind: 'ACCUMULATED_DEPRECIATION', groupCode: '1100' }),
  account('creditors', 'LIABILITY', 'Trade Payables'),
  account('loan', 'LIABILITY', 'Borrowings'),
  account('capital', 'EQUITY', 'Equity'),
  account('sales', 'INCOME', 'Revenue from Operations'),
  account('interest', 'INCOME', 'Other Income'),
  account('cogs', 'EXPENSE', 'Cost of Vehicles Sold'),
  account('salary', 'EXPENSE', 'Employee Benefits Expense'),
  account('dep', 'EXPENSE', 'Depreciation and Amortisation'),
  account('tax', 'EXPENSE', 'Other Expenses', { systemKey: 'INCOME_TAX_EXPENSE' }),
];

// Capital 5L, loan 2L, laptop 1.2L bought, sales 10L (8L received), COGS 6L, salary 1L, dep 10k, tax 50k provision paid.
const vouchers = [
  [{ accountId: 'bank', debit: 500000, credit: 0 }, { accountId: 'capital', debit: 0, credit: 500000 }],
  [{ accountId: 'bank', debit: 200000, credit: 0 }, { accountId: 'loan', debit: 0, credit: 200000 }],
  [{ accountId: 'laptop', debit: 120000, credit: 0 }, { accountId: 'bank', debit: 0, credit: 120000 }],
  [{ accountId: 'debtors', debit: 1000000, credit: 0 }, { accountId: 'sales', debit: 0, credit: 1000000 }],
  [{ accountId: 'bank', debit: 800000, credit: 0 }, { accountId: 'debtors', debit: 0, credit: 800000 }],
  [{ accountId: 'cogs', debit: 600000, credit: 0 }, { accountId: 'creditors', debit: 0, credit: 600000 }],
  [{ accountId: 'creditors', debit: 500000, credit: 0 }, { accountId: 'bank', debit: 0, credit: 500000 }],
  [{ accountId: 'salary', debit: 100000, credit: 0 }, { accountId: 'bank', debit: 0, credit: 100000 }],
  [{ accountId: 'dep', debit: 10000, credit: 0 }, { accountId: 'accdep', debit: 0, credit: 10000 }],
  [{ accountId: 'tax', debit: 50000, credit: 0 }, { accountId: 'bank', debit: 0, credit: 50000 }],
  [{ accountId: 'bank', debit: 2000, credit: 0 }, { accountId: 'interest', debit: 0, credit: 2000 }],
];
const net = new Map<string, number>();
for (const lines of vouchers) for (const line of lines) net.set(line.accountId, (net.get(line.accountId) ?? 0) + line.debit - line.credit);

test('profit and loss in Schedule III order with tax separate', () => {
  const pl = buildProfitAndLoss(accounts, net);
  assert.deepEqual(pl.income.map((line) => [line.line, line.amount]), [['Revenue from Operations', 1000000], ['Other Income', 2000]]);
  assert.equal(pl.totalExpenses, 710000);
  assert.equal(pl.profitBeforeTax, 292000);
  assert.equal(pl.tax.amount, 50000);
  assert.equal(pl.profitAfterTax, 242000);
  assert.equal(pl.grossProfit, 400000);
  assert.equal(pl.grossMarginPercent, 40);
});

test('balance sheet balances with profit inside equity and PPE net of depreciation', () => {
  const sheet = buildBalanceSheet(accounts, net);
  assert.equal(sheet.assets.find((line) => line.line === 'Property, Plant and Equipment')!.amount, 110000);
  assert.equal(sheet.assets.find((line) => line.line === 'Cash and Cash Equivalents')!.amount, 732000);
  assert.equal(sheet.equity.profitForPeriod, 242000);
  assert.equal(sheet.totalAssets, 1042000);
  assert.equal(sheet.totalEquityAndLiabilities, 1042000);
  assert.equal(sheet.difference, 0);
});

test('direct cash flow explains the change in cash', () => {
  const byId = new Map(accounts.map((item) => [item.id, item]));
  const flow = buildCashFlow(byId, vouchers, 0, 732000);
  const section = (category: string) => flow.sections.find((item) => item.category === category)!;
  assert.equal(section('FINANCING').net, 700000);
  assert.equal(section('INVESTING').net, -120000);
  assert.equal(section('OPERATING').net, 152000);
  assert.equal(flow.net, 732000);
  assert.equal(flow.difference, 0);
});
