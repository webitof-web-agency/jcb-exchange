import assert from 'node:assert/strict';
import test from 'node:test';
import { Prisma } from '@prisma/client';
import { moneyEquals, moneyToPaise, paiseToMoney, parseMoneyValue, roundMoney, sumMoney } from './money';

test('parseMoneyValue accepts rupee formatting and rejects junk', () => {
  assert.equal(parseMoneyValue('₹ 12,34,567.50')?.toString(), '1234567.5');
  assert.equal(parseMoneyValue('')?.toString(), '0');
  assert.equal(parseMoneyValue(null)?.toString(), '0');
  assert.equal(parseMoneyValue('12abc'), null);
  assert.equal(parseMoneyValue(Number.NaN), null);
});

test('sumMoney avoids floating point drift', () => {
  assert.equal(sumMoney([0.1, 0.2]).toString(), '0.3');
  assert.equal(sumMoney(['100.10', '200.20', new Prisma.Decimal('0.005')]).toFixed(2), '300.31');
});

test('roundMoney rounds half up to the paisa', () => {
  assert.equal(roundMoney(new Prisma.Decimal('10.005')).toFixed(2), '10.01');
  assert.equal(roundMoney(new Prisma.Decimal('10.004')).toFixed(2), '10.00');
});

test('paise conversion round-trips', () => {
  assert.equal(paiseToMoney(12345).toFixed(2), '123.45');
  assert.equal(moneyToPaise(new Prisma.Decimal('123.456')), 12346);
  assert.equal(moneyEquals('100', 100.001), true);
  assert.equal(moneyEquals('100', 100.01), false);
});
