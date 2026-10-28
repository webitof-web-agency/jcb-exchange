import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertRemark,
  buildInitialTransferTasks,
  buildTaskDocument,
  deriveRtoStatusFromTasks,
  readTaskDocuments,
  RTO_TRANSFER_TASK_DEFINITIONS,
  summarizeTransferTasks,
} from './rtoTransferTasks';

test('task documents accept only secure uploads of PDF or images', () => {
  const now = new Date('2026-10-28T10:00:00Z');
  const document = buildTaskDocument(
    { fileUrl: '/api/documents/secure/drive-1AbC_d-9', originalName: 'RC copy/new.pdf', mimeType: 'application/pdf', size: 2048 },
    { id: 'doc-1', uploadedById: 'user-1', now },
  );
  assert.deepEqual(document, {
    id: 'doc-1', fileUrl: '/api/documents/secure/drive-1AbC_d-9', fileName: 'RC copy_new.pdf', mimeType: 'application/pdf',
    size: 2048, uploadedAt: now.toISOString(), uploadedById: 'user-1',
  });
  assert.throws(() => buildTaskDocument({ fileUrl: 'https://evil.example/x.pdf', mimeType: 'application/pdf' }, { id: 'x' }), /Upload the file first/);
  assert.throws(() => buildTaskDocument({ fileUrl: '/api/documents/secure/drive-abc', mimeType: 'text/html' }, { id: 'x' }), /Only PDF/);
});

test('stored task documents skip malformed entries', () => {
  assert.deepEqual(readTaskDocuments(null), []);
  assert.deepEqual(readTaskDocuments([{ id: 'a', fileUrl: '/x' }, { id: 1 }, null, 'text']).map((entry) => entry.id), ['a']);
});

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
