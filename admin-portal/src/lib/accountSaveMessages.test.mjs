import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getAccountSaveErrorToast,
  getAccountSaveSuccessToast,
} from './accountSaveMessages.mjs';

test('builds distinct create and edit success messages for account modules', () => {
  assert.equal(getAccountSaveSuccessToast('Sell Account', 'create'), 'Sell Account created successfully.');
  assert.equal(getAccountSaveSuccessToast('RTO Work Status', 'edit'), 'RTO Work Status updated successfully.');
});

test('builds a consistent save failure message', () => {
  assert.equal(getAccountSaveErrorToast('Sell Account'), 'Unable to save Sell Account. Please try again.');
});
