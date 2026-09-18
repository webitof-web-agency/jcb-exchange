import test from 'node:test';
import assert from 'node:assert/strict';
import { insertAccountsNavItem } from './adminNavigation.js';

test('inserts Accounts navigation even when Analytics is not available', () => {
  const items = [
    { href: '/employee/dashboard' },
    { href: '/employee/partners' },
  ];
  const accountsItem = { href: '/employee/accounts', kind: 'accounts' };

  const result = insertAccountsNavItem(items, accountsItem);

  assert.deepEqual(result, [
    { href: '/employee/dashboard' },
    { href: '/employee/partners' },
    { href: '/employee/accounts', kind: 'accounts' },
  ]);
});

test('keeps Accounts before Analytics when Analytics is available', () => {
  const items = [
    { href: '/employee/dashboard' },
    { href: '/employee/analytics' },
  ];
  const accountsItem = { href: '/employee/accounts', kind: 'accounts' };

  const result = insertAccountsNavItem(items, accountsItem);

  assert.deepEqual(result, [
    { href: '/employee/dashboard' },
    { href: '/employee/accounts', kind: 'accounts' },
    { href: '/employee/analytics' },
  ]);
});

test('removes duplicate navigation hrefs before inserting Accounts', () => {
  const result = insertAccountsNavItem([
    { href: '/employee/brands' },
    { href: '/employee/recurrence' },
    { href: '/employee/brands' },
    { href: '/employee/recurrence' },
  ], { href: '/employee/accounts' });

  assert.deepEqual(result.map((item) => item.href), [
    '/employee/brands',
    '/employee/recurrence',
    '/employee/accounts',
  ]);
});
