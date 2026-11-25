import assert from 'node:assert/strict';
import test from 'node:test';

import type { HrmEmployee } from './hrmApi';
import {
  DEFAULT_DIRECTORY_FILTERS,
  employeesToCsv,
  getInitials,
  getKycProgress,
  getTabCount,
  nextSort,
  parseDirectoryParams,
  toDirectoryApiQuery,
  toDirectorySearch,
} from './hrmDirectory';

const parse = (query: string) => parseDirectoryParams(new URLSearchParams(query));

test('a clean directory has default filters and a clean URL', () => {
  assert.deepEqual(parse(''), DEFAULT_DIRECTORY_FILTERS);
  assert.equal(toDirectorySearch(DEFAULT_DIRECTORY_FILTERS), '');
});

test('filters round-trip through the URL and unknown values fall back to defaults', () => {
  const filters = parse('q=ravi&tab=onboarding&dept=d1&role=Manager&type=CONTRACT&kyc=pending&sort=name&order=desc&page=3&limit=50&view=cards');
  assert.equal(filters.tab, 'onboarding');
  assert.equal(filters.page, 3);
  assert.equal(filters.limit, 50);
  assert.equal(filters.view, 'cards');
  assert.deepEqual(parse(toDirectorySearch(filters)), filters);

  const bad = parse('tab=nope&type=ROBOT&kyc=maybe&sort=salary&page=-4&limit=7&view=grid');
  assert.equal(bad.tab, '');
  assert.equal(bad.employmentType, '');
  assert.equal(bad.kyc, '');
  assert.equal(bad.sort, DEFAULT_DIRECTORY_FILTERS.sort);
  assert.equal(bad.page, 1);
  assert.equal(bad.limit, DEFAULT_DIRECTORY_FILTERS.limit);
  assert.equal(bad.view, 'table');
});

test('API query carries the status list of a tab and omits empty filters', () => {
  assert.deepEqual(toDirectoryApiQuery({ ...DEFAULT_DIRECTORY_FILTERS, tab: 'onboarding', q: ' ravi ', kyc: 'complete' }), {
    page: 1, limit: 25, sort: 'createdAt', order: 'desc', search: 'ravi', status: 'PRE_ONBOARDING,ONBOARDING', kyc: 'complete',
  });
  assert.equal('status' in toDirectoryApiQuery(DEFAULT_DIRECTORY_FILTERS), false);
});

test('tab counts add up the statuses a tab covers', () => {
  const counts = { all: 9, byStatus: { ACTIVE: 4, ONBOARDING: 2, PRE_ONBOARDING: 1, EXITED: 1, TERMINATED: 1 } };
  assert.equal(getTabCount('', counts), 9);
  assert.equal(getTabCount('onboarding', counts), 3);
  assert.equal(getTabCount('exited', counts), 2);
  assert.equal(getTabCount('draft', counts), 0);
  // The Archived tab shows its own total; status tabs keep the non-archived counts.
  assert.equal(getTabCount('archived', counts, 4), 4);
  assert.equal(getTabCount('archived', counts), null);
  assert.equal(getTabCount('archived', undefined, 0), 0);
  assert.equal(getTabCount('', counts, 4), 9);
  assert.equal(getTabCount('active', undefined), null);
});

test('sorting flips the active column and starts dates newest first', () => {
  assert.deepEqual(nextSort({ sort: 'name', order: 'asc' }, 'name'), { sort: 'name', order: 'desc' });
  assert.deepEqual(nextSort({ sort: 'name', order: 'desc' }, 'status'), { sort: 'status', order: 'asc' });
  assert.deepEqual(nextSort({ sort: 'name', order: 'asc' }, 'joinedOn'), { sort: 'joinedOn', order: 'desc' });
});

test('initials and KYC progress', () => {
  assert.equal(getInitials('Vikash Kumar Singh'), 'VS');
  assert.equal(getInitials('  madhu '), 'M');
  assert.equal(getInitials(''), '?');
  assert.deepEqual(getKycProgress({ pan: true, aadhaar: false, bankAccounts: 1 }), { done: 2, total: 3, complete: false });
  assert.equal(getKycProgress(undefined).done, 0);
});

test('CSV export escapes values, neutralises formulas and never includes raw KYC data', () => {
  const employee = {
    id: 'e1', employeeCode: 'EMP-1', source: 'DIRECT_HR', status: 'ACTIVE', legalName: '=HYPERLINK("x")', preferredName: null,
    workEmail: 'a@b.com', mobile: null, joinedOn: null, version: 1,
    kyc: { pan: true, aadhaar: false, bankAccounts: 0 },
    currentAssignment: { designation: 'Sales, Senior', orgUnit: { id: 'o', code: 'S', name: 'Sales' } },
  } as HrmEmployee;
  const [header, row] = employeesToCsv([employee]).split('\r\n');
  assert.ok(header?.startsWith('Employee code,Name,'));
  assert.ok(row?.includes(`"'=HYPERLINK(""x"")"`));
  assert.ok(row?.includes('"Sales, Senior"'));
  assert.ok(row?.endsWith('Verified,Pending,Pending'));
});
