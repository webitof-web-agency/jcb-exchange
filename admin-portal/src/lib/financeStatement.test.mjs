import assert from 'node:assert/strict';
import test from 'node:test';
import { parseStatementText } from './financeStatement.mjs';

test('parses HDFC-style CSV with quoted commas and maps debit/credit columns', () => {
  const result = parseStatementText([
    'Date,Narration,Withdrawal,Deposit,Closing Balance,Chq/Ref No.',
    '06/10/2026,"UPI/ABC, OFFICE SUPPLIER","1,250.50",,UTR123',
    '07/10/2026,NEFT CUSTOMER PAYMENT,,5000,53749.50,NEFT456',
  ].join('\n'));

  assert.equal(result.delimiter, ',');
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[0].narration, 'UPI/ABC, OFFICE SUPPLIER');
  assert.equal(result.rows[0].withdrawal, '1,250.50');
  assert.equal(result.rows[1].deposit, '5000');
  assert.equal(result.rows[1].reference, 'NEFT456');
});

test('detects tab-separated bank statement columns and skips blank rows', () => {
  const result = parseStatementText([
    'Transaction Date\tParticulars\tDebit\tCredit\tBalance',
    '2026-10-06\tATM CASH\t500\t\t12500',
    '',
    '2026-10-07\tCUSTOMER PAYMENT\t\t1000\t13500',
  ].join('\n'));

  assert.equal(result.delimiter, '\t');
  assert.deepEqual(result.rows.map((row) => row.date), ['2026-10-06', '2026-10-07']);
  assert.equal(result.rows[0].debit, '500');
  assert.equal(result.rows[1].credit, '1000');
});

test('normalizes common currency suffixes in statement headings', () => {
  const result = parseStatementText([
    'Date,Withdrawal Amount (INR),Deposit Amt (Rs.),Closing Bal',
    '06/10/2026,250,,12250',
  ].join('\n'));

  assert.equal(result.rows[0].withdrawal, '250');
  assert.equal(result.rows[0]['closing balance'], '12250');
});
