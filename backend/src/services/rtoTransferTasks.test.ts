import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertRemark,
  buildInitialTransferTasks,
  deriveRtoStatusFromTasks,
  RTO_TRANSFER_TASK_DEFINITIONS,
  summarizeTransferTasks,
} from './rtoTransferTasks';

test('creates the ownership transfer checklist with optional HSRP and fitness', () => {
  const tasks = buildInitialTransferTasks(null);
  assert.deepEqual(tasks.map((task) => task.taskKey), ['RC', 'INSURANCE', 'NOC', 'PUC', 'HSRP', 'TAX', 'FITNESS']);
  assert.deepEqual(tasks.filter((task) => task.isOptional).map((task) => task.taskKey), ['HSRP', 'FITNESS']);
  assert.equal(tasks.every((task) => task.status === 'PENDING'), true);
});

test('flags expired documents when the checklist is created', () => {
  const tasks = buildInitialTransferTasks({
    expiredDocuments: ['INSURANCE'],
    checks: [{ key: 'INSURANCE', label: 'Insurance', level: 'BLOCK', message: 'Insurance expired on 30/09/2026.', action: 'Renew it.' }],
  });
  const insurance = tasks.find((task) => task.taskKey === 'INSURANCE');
  assert.equal(insurance?.status, 'DOCUMENT_EXPIRED');
  assert.match(insurance?.remark || '', /Renew it/);
});

test('derives RTO progress from the checklist', () => {
  const pending = RTO_TRANSFER_TASK_DEFINITIONS.map(() => ({ status: 'PENDING' }));
  assert.equal(deriveRtoStatusFromTasks([]), null);
  assert.equal(deriveRtoStatusFromTasks(pending), 'RTO_WORK_STARTED');
  assert.equal(deriveRtoStatusFromTasks([{ status: 'TRANSFER_INITIATED' }, { status: 'PENDING' }]), 'RTO_WORK_IN_PROGRESS');
  assert.equal(deriveRtoStatusFromTasks([{ status: 'ISSUE_REPORTED' }, { status: 'TRANSFERRED' }]), 'RTO_WORK_FAILED');
  assert.equal(deriveRtoStatusFromTasks([{ status: 'TRANSFERRED' }, { status: 'NOT_REQUIRED' }]), 'RTO_WORK_COMPLETED');
});

test('counts transferred and not-required tasks as done', () => {
  const summary = summarizeTransferTasks([
    { status: 'TRANSFERRED', label: 'RC' },
    { status: 'NOT_REQUIRED', label: 'HSRP' },
    { status: 'PENDING', label: 'Tax' },
  ]);
  assert.equal(summary.done, 2);
  assert.equal(summary.total, 3);
  assert.equal(summary.allDone, false);
  assert.deepEqual(summary.pendingLabels, ['Tax']);
});

test('requires a remark for every status change', () => {
  assert.throws(() => assertRemark('  '), /remark is required/);
  assert.equal(assertRemark('  Insurance renewed by owner '), 'Insurance renewed by owner');
});
