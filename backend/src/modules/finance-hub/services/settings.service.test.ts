import assert from 'node:assert/strict';
import test from 'node:test';
import { buildFinSettingsUpdate, readPostingConfig } from './settings.service';
import { isFinanceHubSchemaMissing } from './schemaState';

test('buildFinSettingsUpdate parses dates and limits', () => {
  const result = buildFinSettingsUpdate({ booksBeginDate: '01-04-2026', cashLimitPerVoucher: '10,000', cashReceiptLimit: '' });
  assert.ok('data' in result);
  assert.equal(result.data.booksBeginDate?.toISOString().slice(0, 10), '2026-04-01');
  assert.equal(result.data.cashLimitPerVoucher?.toFixed(2), '10000.00');
  assert.equal(result.data.cashReceiptLimit, null);
});

test('buildFinSettingsUpdate rejects posting mode changes until the worker exists', () => {
  assert.deepEqual(Object.keys(buildFinSettingsUpdate({ postingMode: 'LIVE' })), ['error']);
});

test('buildFinSettingsUpdate rejects negative or invalid limits and empty bodies', () => {
  assert.ok('error' in buildFinSettingsUpdate({ cashLimitPerVoucher: -5 }));
  assert.ok('error' in buildFinSettingsUpdate({ cashReceiptLimit: 'abc' }));
  assert.ok('error' in buildFinSettingsUpdate({ booksBeginDate: 'not a date' }));
  assert.ok('error' in buildFinSettingsUpdate({}));
});

test('isFinanceHubSchemaMissing recognises a missing finance hub table', () => {
  assert.equal(isFinanceHubSchemaMissing({ code: 'P2021' }), true);
  assert.equal(isFinanceHubSchemaMissing({ message: 'relation "FinSettings" does not exist' }), true);
  assert.equal(isFinanceHubSchemaMissing({ code: 'P2002' }), false);
  assert.equal(isFinanceHubSchemaMissing(null), false);
});

test('every posting source, including Expenses-page entries, is on unless switched off', () => {
  assert.equal(readPostingConfig(null).sources.FINANCE_TRANSACTION, true);
  assert.equal(readPostingConfig({ posting: { sources: { FINANCE_TRANSACTION: false } } }).sources.FINANCE_TRANSACTION, false);
  assert.ok(Object.values(readPostingConfig({}).sources).every(Boolean));
});
