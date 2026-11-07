import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatDateInput,
  getCalendarCells,
  parseDateInput,
} from './partnerDirectoryCalendar.mjs';

test('round-trips a date input without a timezone shift', () => {
  const date = parseDateInput('2026-11-06');

  assert.equal(formatDateInput(date), '2026-11-06');
});

test('builds a complete Sunday-first month grid', () => {
  const cells = getCalendarCells(2026, 9);

  assert.equal(cells.length, 42);
  assert.equal(cells[0].date, '2026-09-27');
  assert.equal(cells[6].date, '2026-10-03');
  assert.equal(cells[7].date, '2026-10-04');
  assert.equal(cells[7].isCurrentMonth, true);
  assert.equal(cells[41].date, '2026-11-07');
});

test('rejects incomplete or impossible date values', () => {
  assert.equal(parseDateInput(''), null);
  assert.equal(parseDateInput('2026-2-06'), null);
  assert.equal(parseDateInput('2026-02-31'), null);
});
