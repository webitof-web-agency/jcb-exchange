import assert from 'node:assert/strict';
import test from 'node:test';
import { validateBusinessEmail } from './businessEmail';

test('accepts a dealership-owned email domain', () => {
  assert.deepEqual(validateBusinessEmail(' Sales@Ravi-Machines.in '), {
    valid: true,
    normalized: 'sales@ravi-machines.in',
  });
});

test('rejects known consumer email domains for partner registration', () => {
  assert.deepEqual(validateBusinessEmail('dealer@gmail.com'), { valid: false, code: 'consumer_domain' });
  assert.deepEqual(validateBusinessEmail('dealer@yahoo.co.in'), { valid: false, code: 'consumer_domain' });
});

test('rejects malformed business email values', () => {
  assert.deepEqual(validateBusinessEmail('dealer-at-company.in'), { valid: false, code: 'invalid_format' });
});
