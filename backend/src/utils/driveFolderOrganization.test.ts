import assert from 'node:assert/strict';
import test from 'node:test';
import { getYearMonthFolderNames } from './driveFolderOrganization';

test('builds a stable year and month folder name in the configured timezone', () => {
  assert.deepEqual(
    getYearMonthFolderNames(new Date('2026-09-24T12:00:00.000Z')),
    { year: '2026', month: '09-September' },
  );
});

test('uses India time when an upload crosses a UTC month boundary', () => {
  assert.deepEqual(
    getYearMonthFolderNames(new Date('2026-09-30T19:00:00.000Z')),
    { year: '2026', month: '10-October' },
  );
});
