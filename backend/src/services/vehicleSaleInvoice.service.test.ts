import assert from 'node:assert/strict';
import test from 'node:test';
import { hashInvoiceToken, issueInvoiceToken, isWellFormedInvoiceToken } from './vehicleSaleInvoice.service';

test('issues an unguessable link token and stores only its hash', () => {
  const now = new Date('2026-10-20T00:00:00Z');
  const first = issueInvoiceToken(now);
  const second = issueInvoiceToken(now);
  assert.notEqual(first.token, second.token);
  assert.equal(isWellFormedInvoiceToken(first.token), true);
  assert.equal(first.tokenHash, hashInvoiceToken(first.token));
  assert.notEqual(first.tokenHash, first.token);
  assert.equal(first.expiresAt.toISOString(), '2027-04-18T00:00:00.000Z');
});

test('rejects malformed tokens before any lookup', () => {
  assert.equal(isWellFormedInvoiceToken('short'), false);
  assert.equal(isWellFormedInvoiceToken(`${'a'.repeat(42)}/`), false);
  assert.equal(isWellFormedInvoiceToken(undefined), false);
});
