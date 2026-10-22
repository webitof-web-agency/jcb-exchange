import assert from 'node:assert/strict';
import test from 'node:test';
import { Prisma } from '@prisma/client';
import { needsApproval, parseVoucherInput, periodPostingError, reversedLines, validateVoucher, type LedgerAccount, type LedgerReferences } from './ledgerRules';
import { buildLedgerRows, buildTrialBalance } from './reportRules';
import { buildFinSettingsUpdate, readApprovalPolicy } from './settings.service';

const D = (value: number | string) => new Prisma.Decimal(value);
const account = (id: string, kind: LedgerAccount['kind'] = 'GENERAL', extra: Partial<LedgerAccount> = {}): LedgerAccount => ({
  id, code: id, name: id, kind, isActive: true, allowManualPosting: true, requiresParty: false, requiresVehicle: false, requiresCostCentre: false, ...extra,
});
const refs = (accounts: LedgerAccount[], extra: Partial<LedgerReferences> = {}): LedgerReferences => ({
  accounts: new Map(accounts.map((item) => [item.id, item])), parties: new Set(['p1']), costCentres: new Set(['cc1']), vehicles: new Set(['v1']), ...extra,
});
const line = (accountId: string, debit: number, credit: number, extra: Record<string, unknown> = {}) => ({
  accountId, partyId: null, sellAccountId: null, costCentreId: null, debit: D(debit), credit: D(credit), narration: null, billRef: null, ...extra,
});
const all = refs([
  account('bank', 'BANK'), account('cash', 'CASH'), account('rent'), account('capital'),
  account('debtors', 'PARTY_CONTROL', { requiresParty: true }), account('stock', 'STOCK', { requiresVehicle: true }),
  account('gstout', 'TAX', { allowManualPosting: false }), account('old', 'GENERAL', { isActive: false }),
]);
const voucher = (type: Parameters<typeof validateVoucher>[0]['type'], lines: ReturnType<typeof line>[]) => ({ type, lines, narration: 'Test', partyId: null, costCentreId: null, sellAccountId: null });

test('parseVoucherInput drops empty lines and reads Indian date formats', () => {
  const input = parseVoucherInput({ type: 'PAYMENT', date: '21-10-2026', narration: ' Rent ', lines: [{ accountId: 'rent', debit: '5,000' }, { accountId: 'bank', credit: 5000 }, { accountId: 'x' }] }, ['PAYMENT']);
  assert.equal(input.date.toISOString().slice(0, 10), '2026-10-21');
  assert.equal(input.lines.length, 2);
  assert.equal(input.lines[0]?.debit.toFixed(2), '5000.00');
  assert.throws(() => parseVoucherInput({ type: 'SALES', date: '2026-10-21', lines: [] }, ['PAYMENT']), /Voucher type is invalid/);
});

test('validateVoucher enforces double entry', () => {
  assert.equal(validateVoucher(voucher('PAYMENT', [line('rent', 5000, 0), line('bank', 0, 5000)]), all, { manual: true }).toFixed(2), '5000.00');
  assert.throws(() => validateVoucher(voucher('PAYMENT', [line('rent', 5000, 0), line('bank', 0, 4999.99)]), all, { manual: true }), /must be equal\. Difference 0\.01/);
  assert.throws(() => validateVoucher(voucher('JOURNAL', [line('rent', 10, 10), line('capital', 0, 0)]), all, { manual: true }), /either debit or credit/);
  assert.throws(() => validateVoucher(voucher('JOURNAL', [line('rent', 10, 0)]), all, { manual: true }), /at least two lines/);
  assert.throws(() => validateVoucher({ ...voucher('JOURNAL', [line('rent', 10, 0), line('capital', 0, 10)]), narration: ' ' }, all, { manual: true }), /Narration is required/);
});

test('validateVoucher applies ledger rules', () => {
  assert.throws(() => validateVoucher(voucher('JOURNAL', [line('old', 10, 0), line('capital', 0, 10)]), all, { manual: true }), /inactive/);
  assert.throws(() => validateVoucher(voucher('JOURNAL', [line('gstout', 10, 0), line('capital', 0, 10)]), all, { manual: true }), /posted automatically/);
  assert.doesNotThrow(() => validateVoucher(voucher('OPENING', [line('gstout', 10, 0), line('capital', 0, 10)]), all, { manual: false }));
  assert.throws(() => validateVoucher(voucher('JOURNAL', [line('debtors', 10, 0), line('capital', 0, 10)]), all, { manual: true }), /needs a party/);
  assert.doesNotThrow(() => validateVoucher(voucher('JOURNAL', [line('debtors', 10, 0, { partyId: 'p1' }), line('capital', 0, 10)]), all, { manual: true }));
  assert.throws(() => validateVoucher(voucher('JOURNAL', [line('stock', 10, 0), line('capital', 0, 10)]), all, { manual: true }), /needs a vehicle/);
  assert.throws(() => validateVoucher(voucher('JOURNAL', [line('stock', 10, 0, { sellAccountId: 'gone' }), line('capital', 0, 10)]), all, { manual: true }), /vehicle not found/);
});

test('voucher types keep bank and cash movements in the right voucher', () => {
  assert.throws(() => validateVoucher(voucher('PAYMENT', [line('rent', 10, 0), line('capital', 0, 10)]), all, { manual: true }), /must credit a bank or cash/);
  assert.throws(() => validateVoucher(voucher('PAYMENT', [line('cash', 10, 0), line('bank', 0, 10)]), all, { manual: true }), /contra voucher/);
  assert.doesNotThrow(() => validateVoucher(voucher('RECEIPT', [line('bank', 10, 0), line('debtors', 0, 10, { partyId: 'p1' })]), all, { manual: true }));
  assert.throws(() => validateVoucher(voucher('RECEIPT', [line('rent', 10, 0), line('bank', 0, 10)]), all, { manual: true }), /must debit a bank or cash/);
  assert.doesNotThrow(() => validateVoucher(voucher('CONTRA', [line('cash', 10, 0), line('bank', 0, 10)]), all, { manual: true }));
  assert.throws(() => validateVoucher(voucher('CONTRA', [line('rent', 10, 0), line('bank', 0, 10)]), all, { manual: true }), /only use bank, cash/);
  // System contra (gateway settlement) may carry a charge line but must still move money between bank/cash.
  assert.doesNotThrow(() => validateVoucher(voucher('CONTRA', [line('bank', 9, 0), line('rent', 1, 0), line('cash', 0, 10)]), all, { manual: false }));
  assert.throws(() => validateVoucher(voucher('CONTRA', [line('rent', 10, 0), line('bank', 0, 10)]), all, { manual: false }), /moves money from one/);
  assert.throws(() => validateVoucher(voucher('JOURNAL', [line('rent', 10, 0), line('bank', 0, 10)]), all, { manual: true }), /Use a payment, receipt or contra/);
});

test('period posting rules and approval policy', () => {
  assert.match(periodPostingError({ status: 'LOCKED', label: 'Apr 2026' }, true) || '', /locked/);
  assert.match(periodPostingError({ status: 'SOFT_CLOSED', label: 'Apr 2026' }, false) || '', /soft closed/);
  assert.equal(periodPostingError({ status: 'SOFT_CLOSED', label: 'Apr 2026' }, true), null);
  assert.equal(periodPostingError({ status: 'OPEN', label: 'Apr 2026' }, false), null);

  const policy = { threshold: D(100000), cashRequiresApproval: true };
  assert.equal(needsApproval(policy, D(99999.99), ['BANK', 'GENERAL']), false);
  assert.equal(needsApproval(policy, D(100000), ['BANK', 'GENERAL']), true);
  assert.equal(needsApproval(policy, D(10), ['CASH', 'GENERAL']), true);
  assert.equal(needsApproval({ threshold: null, cashRequiresApproval: false }, D(1e9), ['CASH']), false);

  const swapped = reversedLines([{ debit: D(5), credit: D(0) }, { debit: D(0), credit: D(5) }]);
  assert.deepEqual(swapped.map((item) => [item.debit.toNumber(), item.credit.toNumber()]), [[0, 5], [5, 0]]);
});

test('approval settings parse and round-trip through config', () => {
  const update = buildFinSettingsUpdate({ approvalThreshold: '1,00,000', cashRequiresApproval: true });
  assert.ok('data' in update);
  assert.deepEqual(update.data.approval, { threshold: '100000.00', cashRequiresApproval: true });
  assert.deepEqual(readApprovalPolicy({ approval: update.data.approval }).threshold?.toNumber(), 100000);
  assert.equal(readApprovalPolicy(null).threshold, null);
  assert.equal(readApprovalPolicy({ approval: { threshold: '0', cashRequiresApproval: false } }).threshold, null);
  assert.ok('error' in buildFinSettingsUpdate({ cashRequiresApproval: 'yes' }));
});

test('trial balance carries balance-sheet ledgers, resets P&L each year and balances', () => {
  const groups = [
    { id: 'gA', code: '1000', name: 'Assets', nature: 'ASSET' as const, parentId: null },
    { id: 'gE', code: '3000', name: 'Equity', nature: 'EQUITY' as const, parentId: null },
    { id: 'gI', code: '4000', name: 'Income', nature: 'INCOME' as const, parentId: null },
    { id: 'gX', code: '6000', name: 'Expense', nature: 'EXPENSE' as const, parentId: null },
  ];
  const acct = (id: string, groupId: string, systemKey: string | null = null) => ({ id, code: id, name: id, groupId, normalBalance: 'DR' as const, systemKey, isActive: true });
  const accounts = [acct('bank', 'gA'), acct('capital', 'gE'), acct('re', 'gE', 'RETAINED_EARNINGS'), acct('sales', 'gI'), acct('rent', 'gX'), acct('unused', 'gX')];
  const sums = (entries: Record<string, [number, number]>) => new Map(Object.entries(entries).map(([id, [debit, credit]]) => [id, { debit: D(debit), credit: D(credit) }]));

  const tb = buildTrialBalance({
    accounts,
    groups,
    // last year: capital 100k into bank, sold 50k, rent 20k → prior profit 30k
    beforeYear: sums({ bank: [150000, 20000], capital: [0, 100000], sales: [0, 50000], rent: [20000, 0] }),
    yearToFrom: sums({ rent: [5000, 0], bank: [0, 5000] }),
    period: sums({ bank: [80000, 0], sales: [0, 80000] }),
    includeZero: false,
  });
  const row = (id: string) => tb.rows.find((item) => item.accountId === id)!;
  assert.equal(row('bank').openingDebit, 125000);
  assert.equal(row('bank').closingDebit, 205000);
  assert.equal(row('sales').openingCredit, 0, 'income restarts each year');
  assert.equal(row('sales').closingCredit, 80000);
  assert.equal(row('rent').openingDebit, 5000, 'expense since 1 April only');
  assert.equal(row('re').openingCredit, 30000, 'earlier years profit parked on retained earnings');
  assert.ok(row('re').note);
  assert.equal(tb.rows.some((item) => item.accountId === 'unused'), false);
  assert.equal(tb.difference, 0);
  assert.equal(tb.totals.closingDebit, tb.totals.closingCredit);
  assert.equal(tb.priorYearsProfitAndLoss, 30000);
  assert.equal(tb.retainedEarningsMissing, false);
});

test('ledger rows keep a running balance from the opening', () => {
  const ledger = buildLedgerRows(D(1000), [
    { id: 'l1', date: '2026-10-01', voucherId: 'v1', voucherNumber: 'RV/1', voucherType: 'RECEIPT', narration: 'in', lineNarration: null, partyName: null, debit: D(500), credit: D(0) },
    { id: 'l2', date: '2026-10-02', voucherId: 'v2', voucherNumber: 'PV/1', voucherType: 'PAYMENT', narration: 'out', lineNarration: null, partyName: null, debit: D(0), credit: D(2000) },
  ]);
  assert.deepEqual(ledger.rows.map((item) => item.balance), [1500, -500]);
  assert.equal(ledger.closing, -500);
  assert.equal(ledger.totalDebit, 500);
  assert.equal(ledger.totalCredit, 2000);
});
