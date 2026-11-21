import test from 'node:test';
import assert from 'node:assert/strict';
import { fromInterviewDateTimeInput, toInterviewDateTimeInput } from './interviewDateTime';

test('keeps the selected local interview date and time when round-tripping', () => {
  const selected = '2026-11-21T11:36';
  assert.equal(toInterviewDateTimeInput(fromInterviewDateTimeInput(selected)), selected);
});

