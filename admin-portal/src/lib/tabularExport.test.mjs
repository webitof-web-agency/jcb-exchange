import test from 'node:test';
import assert from 'node:assert/strict';

import { buildCsvContent, buildExcelHtml, withFileExtension } from './tabularExport.js';

const columns = [
  { header: 'Name', value: (row) => row.name },
  { header: 'Amount', value: (row) => row.amount },
  { header: 'Note', value: (row) => row.note },
];

test('buildCsvContent creates Excel-friendly CSV and escapes cells correctly', () => {
  const csv = buildCsvContent(columns, [
    { name: 'Alpha, Traders', amount: 1200, note: 'quoted "note"\nnext line' },
    { name: null, amount: 0, note: undefined },
  ]);

  assert.equal(
    csv,
    '\uFEFFName,Amount,Note\r\n"Alpha, Traders",1200,"quoted ""note""\nnext line"\r\n,0,'
  );
});

test('buildExcelHtml creates an html spreadsheet with escaped values', () => {
  const html = buildExcelHtml(columns, [
    { name: '<Alpha>', amount: 1200, note: 'A & B' },
  ]);

  assert.match(html, /<table>/);
  assert.match(html, /<th>Name<\/th>/);
  assert.match(html, /<td>&lt;Alpha&gt;<\/td>/);
  assert.match(html, /<td>A &amp; B<\/td>/);
});

test('withFileExtension replaces or appends the requested extension', () => {
  assert.equal(withFileExtension('sell-accounts', 'csv'), 'sell-accounts.csv');
  assert.equal(withFileExtension('rto-work-status.xls', 'csv'), 'rto-work-status.csv');
});
