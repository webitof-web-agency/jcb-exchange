import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCsv, escapeCsvCell } from './csvExport';

test('quotes commas, quotes, and line breaks according to CSV rules', () => {
  assert.equal(escapeCsvCell('JCB, "3DX"\nused'), '"JCB, ""3DX""\nused"');
});

test('neutralizes spreadsheet formula-like text without changing numbers', () => {
  assert.equal(escapeCsvCell('=HYPERLINK("https://example.com")'), '"\'=HYPERLINK(""https://example.com"")"');
  assert.equal(escapeCsvCell(-100), '"-100"');
});

test('emits an Excel-compatible UTF-8 document with CRLF row endings', () => {
  assert.equal(buildCsv([['Name', 'Value'], ['Indore', 10]]), '\uFEFF"Name","Value"\r\n"Indore","10"\r\n');
});
