import test from 'node:test';
import assert from 'node:assert/strict';
import { getTransferTaskStatus, isValidRemark, summarizeTransferTasks } from './rtoTransferTasks.mjs';

test('summarizes checklist progress like 5/8 done', () => {
  const summary = summarizeTransferTasks([
    { status: 'TRANSFERRED' },
    { status: 'NOT_REQUIRED' },
    { status: 'ISSUE_REPORTED' },
    { status: 'DOCUMENT_EXPIRED' },
  ]);
  assert.equal(summary.done, 2);
  assert.equal(summary.total, 4);
  assert.equal(summary.percent, 50);
  assert.equal(summary.allDone, false);
  assert.equal(summary.issues, 1);
  assert.equal(summary.expired, 1);
  assert.equal(summarizeTransferTasks([]).allDone, false);
});

test('falls back to pending for unknown statuses', () => {
  assert.equal(getTransferTaskStatus('NOPE').value, 'PENDING');
  assert.equal(getTransferTaskStatus('TRANSFERRED').label, 'Transferred');
});

test('requires a meaningful remark', () => {
  assert.equal(isValidRemark('  '), false);
  assert.equal(isValidRemark('ok'), false);
  assert.equal(isValidRemark('Insurance renewed'), true);
});
