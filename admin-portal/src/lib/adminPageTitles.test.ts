import assert from 'node:assert/strict';
import test from 'node:test';
import { isFinanceTransactionDetailPath } from './adminPageTitles';

test('recognizes finance transaction detail routes for every admin portal role', () => {
  assert.equal(isFinanceTransactionDetailPath('/employee/finance/expenses/5eae05d4-1bac-4380-977d-d123918cc9c7'), true);
  assert.equal(isFinanceTransactionDetailPath('/admin/finance/expenses/transaction-1'), true);
  assert.equal(isFinanceTransactionDetailPath('/superadmin/finance/expenses/transaction-1'), true);
  assert.equal(isFinanceTransactionDetailPath('/employee/finance/expenses'), false);
});
