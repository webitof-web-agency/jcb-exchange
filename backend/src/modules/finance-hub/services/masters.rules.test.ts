import assert from 'node:assert/strict';
import test from 'node:test';
import { Prisma } from '@prisma/client';
import { DEFAULT_ACCOUNTS, DEFAULT_GROUPS } from '../seed/defaultChart';
import { planDefaultChartInstall } from './accounts.service';
import { ledgerKindForBankType, nextCashBankCode } from './bankAccounts.service';
import { buildCompanyProfileInput } from './company.service';
import { openingLineKey, validateOpeningLines } from './openingBalances.service';
import { buildPartyInput, maskAccountNumber, planPartySync, type PartyCandidate } from './parties.service';
import { checkPeriodTransition, defaultSeriesPrefix, formatVoucherNumber } from './periods.service';

const statusError = (error: unknown) => (error as { status?: number }).status;

test('voucher numbers use the FY in the prefix and pad the sequence', () => {
  assert.equal(defaultSeriesPrefix('JOURNAL', 2026), 'JV/26-27/');
  assert.equal(defaultSeriesPrefix('PAYMENT', 2099), 'PV/99-00/');
  assert.equal(formatVoucherNumber('JV/26-27/', 42, 5), 'JV/26-27/00042');
});

test('months close in order and reopen from the latest', () => {
  const periods = [
    { label: 'Apr 2026', status: 'LOCKED' as const },
    { label: 'May 2026', status: 'SOFT_CLOSED' as const },
    { label: 'Jun 2026', status: 'OPEN' as const },
  ];
  assert.equal(checkPeriodTransition(periods, 2, 'SOFT_CLOSED'), null);
  assert.match(checkPeriodTransition(periods, 2, 'LOCKED') || '', /Close May 2026 first/);
  assert.equal(checkPeriodTransition(periods, 1, 'LOCKED'), null);
  assert.match(checkPeriodTransition(periods, 0, 'OPEN') || '', /Reopen May 2026 first/);
  assert.equal(checkPeriodTransition(periods, 1, 'OPEN'), null);
  assert.match(checkPeriodTransition(periods, 2, 'OPEN') || '', /already open/);
});

test('installing the default chart only adds what is missing', () => {
  const fresh = planDefaultChartInstall({ groupCodes: new Set(), accountCodes: new Set(), systemKeys: new Set(), mappedCategories: new Set() });
  assert.equal(fresh.groups.length, DEFAULT_GROUPS.length);
  assert.equal(fresh.accounts.length, DEFAULT_ACCOUNTS.length);
  assert.ok(fresh.categoryMaps.some((map) => map.category === 'Fuel' && map.code === '6310'));

  const partial = planDefaultChartInstall({
    groupCodes: new Set(DEFAULT_GROUPS.map((group) => group.code)),
    accountCodes: new Set(['1350']),
    systemKeys: new Set(['CASH_IN_HAND', 'SUSPENSE']),
    mappedCategories: new Set(['Fuel']),
  });
  assert.equal(partial.groups.length, 0);
  assert.equal(partial.accounts.some((account) => account.code === '1350'), false);
  assert.equal(partial.accounts.some((account) => account.code === '1401'), false, 'SUSPENSE key is taken by another ledger');
  assert.equal(partial.conflicts.length, 1);
  assert.equal(partial.categoryMaps.some((map) => map.category === 'Fuel'), false);
});

test('bank ledgers get codes in their own ranges', () => {
  assert.equal(ledgerKindForBankType('VIRTUAL'), 'BANK');
  assert.equal(ledgerKindForBankType('GATEWAY'), 'GATEWAY_CLEARING');
  assert.equal(nextCashBankCode(new Set(['1301', '1302']), 'CURRENT'), '1303');
  assert.equal(nextCashBankCode(new Set(['1350']), 'PETTY_CASH'), '1351');
  const full = new Set(Array.from({ length: 49 }, (_, index) => String(1301 + index)));
  assert.equal(nextCashBankCode(full, 'SAVINGS'), null);
});

test('party input derives PAN and state from GSTIN and rejects mismatches', () => {
  const party = buildPartyInput({ name: ' Shree  Ganesh Earthmovers ', types: ['SELLER', 'SELLER', 'CUSTOMER'], gstin: '27aapfu0939f1zv', mobile: '+91 98765 43210' });
  assert.equal(party.name, 'Shree Ganesh Earthmovers');
  assert.deepEqual(party.types, ['SELLER', 'CUSTOMER']);
  assert.equal(party.pan, 'AAPFU0939F');
  assert.equal(party.state, 'Maharashtra');
  assert.equal(party.stateCode, '27');
  assert.equal(party.mobile, '9876543210');

  assert.throws(() => buildPartyInput({ name: 'X', types: ['VENDOR'], gstin: '27AAPFU0939F1ZV', pan: 'ABCDE1234F' }), /PAN does not match/);
  assert.throws(() => buildPartyInput({ name: 'X', types: [] }), /at least one party type/);
  assert.throws(() => buildPartyInput({ name: 'X', types: ['VENDOR'], mobile: '12345' }), /10-digit/);
  assert.throws(() => buildPartyInput({ name: 'X', types: ['VENDOR'], ifsc: 'HDFC1234567' }), /IFSC/);
  assert.equal(maskAccountNumber('50100123456789'), 'XXXXXXXXXX6789');
});

test('company profile validates identifiers and derives the state code', () => {
  const profile = buildCompanyProfileInput({ legalName: 'JCB Exchange', pan: 'aapfu0939f', tan: 'MUMA12345B', state: 'Maharashtra', pinCode: '400001' });
  assert.equal(profile.pan, 'AAPFU0939F');
  assert.equal(profile.stateCode, '27');
  assert.throws(() => buildCompanyProfileInput({ legalName: '' }), /Legal name is required/);
  assert.throws(() => buildCompanyProfileInput({ legalName: 'X', tan: 'BAD' }), /TAN/);
});

const candidate = (overrides: Partial<PartyCandidate>): PartyCandidate => ({
  linkType: 'SELL_ACCOUNT_SELLER', linkId: 'sa-1', type: 'SELLER', name: 'Ramesh Patil', mobile: '9876543210', gstin: null, city: null, state: 'Maharashtra', ...overrides,
});

test('party sync merges by mobile, adds missing types and skips existing links', () => {
  const plan = planPartySync(
    [{ id: 'p1', name: 'Ramesh Patil', mobile: '9876543210', gstin: null, types: ['SELLER'] }],
    new Set(['SELL_ACCOUNT_SELLER:sa-1']),
    [
      candidate({}),
      candidate({ linkType: 'SELL_ACCOUNT_PURCHASER', linkId: 'sa-2', type: 'CUSTOMER' }),
      candidate({ linkType: 'SELL_ACCOUNT_SELLER', linkId: 'sa-3', name: 'Suresh', mobile: '9123456780' }),
      candidate({ linkType: 'SELL_ACCOUNT_PURCHASER', linkId: 'sa-4', type: 'CUSTOMER', name: 'Suresh', mobile: '9123456780' }),
      candidate({ linkType: 'SELL_ACCOUNT_BROKER', linkId: 'sa-5', type: 'BROKER', name: 'Mahesh', mobile: null }),
      candidate({ linkType: 'SELL_ACCOUNT_BROKER', linkId: 'sa-6', type: 'BROKER', name: ' mahesh ', mobile: null }),
    ],
  );
  assert.equal(plan.alreadyLinked, 1);
  assert.deepEqual(plan.update, [{ partyId: 'p1', addTypes: ['CUSTOMER'], links: [candidate({ linkType: 'SELL_ACCOUNT_PURCHASER', linkId: 'sa-2', type: 'CUSTOMER' })] }]);
  assert.equal(plan.create.length, 2);
  const suresh = plan.create.find((item) => item.name === 'Suresh')!;
  assert.deepEqual(suresh.types.sort(), ['CUSTOMER', 'SELLER']);
  assert.equal(suresh.links.length, 2);
  assert.equal(plan.create.find((item) => item.name === 'Mahesh')?.links.length, 2);
  assert.equal(plan.nameOnlyMatches, 1);
});

test('party sync merges a GSTIN record and a mobile-only record of the same person in one batch', () => {
  const plan = planPartySync([], new Set(), [
    candidate({ linkType: 'PARTNER_PROFILE', linkId: 'pp-1', type: 'PARTNER', name: 'Om Earthmovers', mobile: '9876500001', gstin: '27AAPFU0939F1ZV' }),
    candidate({ linkType: 'SELL_ACCOUNT_PURCHASER', linkId: 'sa-9', type: 'CUSTOMER', name: 'Om Earthmovers', mobile: '9876500001' }),
    candidate({ linkType: 'SELL_ACCOUNT_SELLER', linkId: 'sa-10', type: 'SELLER', name: 'Om Earth', mobile: null, gstin: '27AAPFU0939F1ZV' }),
  ]);
  assert.equal(plan.create.length, 1);
  assert.deepEqual(plan.create[0]?.types.sort(), ['CUSTOMER', 'PARTNER', 'SELLER']);
  assert.equal(plan.create[0]?.links.length, 3);
});

test('opening balances: one side per line, party where required, no P&L ledgers', () => {
  const accounts = new Map([
    ['bank', { id: 'bank', code: '1301', name: 'HDFC', isActive: true, requiresParty: false, systemKey: null, nature: 'ASSET' }],
    ['debtors', { id: 'debtors', code: '1221', name: 'Debtors', isActive: true, requiresParty: true, systemKey: 'DEBTORS_CONTROL', nature: 'ASSET' }],
    ['capital', { id: 'capital', code: '3100', name: 'Capital', isActive: true, requiresParty: false, systemKey: 'CAPITAL', nature: 'EQUITY' }],
    ['rent', { id: 'rent', code: '6200', name: 'Rent', isActive: true, requiresParty: false, systemKey: null, nature: 'EXPENSE' }],
    ['diff', { id: 'diff', code: '3900', name: 'Opening Difference', isActive: true, requiresParty: false, systemKey: 'OPENING_DIFFERENCE', nature: 'EQUITY' }],
  ]);
  const parties = new Set(['p1']);

  const { lines, totals } = validateOpeningLines([
    { accountId: 'bank', debit: '1,50,000.50' },
    { accountId: 'debtors', partyId: 'p1', debit: 50000, billRef: 'si-9', billDate: '2026-03-10', dueDate: '2026-04-10' },
    { accountId: 'capital', credit: '200000.50' },
    { accountId: 'bank', debit: 0, credit: 0 },
  ], accounts, parties);
  assert.equal(lines.length, 3);
  assert.equal(lines[1]?.lineKey, openingLineKey('debtors', 'p1', 'SI-9'));
  assert.equal(totals.debit.toFixed(2), '200000.50');
  assert.ok(totals.difference.equals(new Prisma.Decimal(0)));

  const failure = (rows: unknown[]) => { try { validateOpeningLines(rows, accounts, parties); return null; } catch (error) { return error as Error; } };
  assert.match(failure([{ accountId: 'bank', debit: 10, credit: 5 }])?.message || '', /either debit or credit/);
  assert.match(failure([{ accountId: 'debtors', debit: 10 }])?.message || '', /needs a party/);
  assert.match(failure([{ accountId: 'rent', debit: 10 }])?.message || '', /open at zero/);
  assert.match(failure([{ accountId: 'diff', credit: 10 }])?.message || '', /calculated/);
  assert.match(failure([{ accountId: 'bank', debit: 1 }, { accountId: 'bank', debit: 2 }])?.message || '', /duplicate/);
  assert.equal(statusError(failure([{ accountId: 'missing', debit: 1 }])), 400);
});
