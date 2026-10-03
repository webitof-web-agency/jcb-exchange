import assert from 'node:assert/strict';
import test from 'node:test';
import { getApiErrorMessage } from './apiError.mjs';

test('prefers the backend error message over Axios generic errors', () => {
  assert.equal(
    getApiErrorMessage({ response: { data: { error: 'Mobile number is already in use.' } } }, 'Fallback'),
    'Mobile number is already in use.',
  );
});

test('falls back safely for unknown error shapes', () => {
  assert.equal(getApiErrorMessage(new Error('Request failed with status code 409'), 'Fallback'), 'Fallback');
  assert.equal(getApiErrorMessage(null, 'Fallback'), 'Fallback');
});
