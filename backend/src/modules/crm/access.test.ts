import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCrmAccess } from './access';

test('CRM read permission grants the shared Leads list and Kanban read capability', () => {
  const access = buildCrmAccess('employee-1', 'EMPLOYEE', ['crm.read']);

  assert.equal(access.canRead, true);
  assert.equal(access.canManage, false);
  assert.equal(access.canPipelineManage, false);
});

test('non-lead CRM permissions do not grant Leads list or Kanban read access', () => {
  for (const permission of ['crm.settings', 'crm.export', 'crm.import', 'crm.campaigns', 'crm.reports']) {
    const access = buildCrmAccess('employee-1', 'EMPLOYEE', [permission]);
    assert.equal(access.canRead, false, `${permission} must not grant CRM lead read access`);
  }
});

test('pipeline management is independent from lead management', () => {
  const access = buildCrmAccess('employee-1', 'EMPLOYEE', ['crm.read', 'crm.pipeline.manage']);

  assert.equal(access.canRead, true);
  assert.equal(access.canManage, false);
  assert.equal(access.canPipelineManage, true);
});

test('admins retain full Leads, Kanban and pipeline access', () => {
  const access = buildCrmAccess('admin-1', 'ADMIN', []);

  assert.equal(access.canRead, true);
  assert.equal(access.canManage, true);
  assert.equal(access.canPipelineManage, true);
});
