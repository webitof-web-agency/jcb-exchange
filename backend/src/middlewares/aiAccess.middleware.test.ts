import assert from 'node:assert/strict';
import test from 'node:test';
import type { NextFunction, Request, Response } from 'express';
import {
  canManageAiSettingsRole,
  canUseAiRole,
  requireAiAccess,
  requireAiSettingsManagement,
} from './aiAccess.middleware';

const responseRecorder = () => {
  const state: { statusCode: number; body: unknown } = { statusCode: 200, body: undefined };
  const response = {
    status: (statusCode: number) => { state.statusCode = statusCode; return response; },
    json: (body: unknown) => { state.body = body; return response; },
  } as unknown as Response;
  return { response, state };
};

test('allows Superadmin, Admin, and permitted Employee AI access only', () => {
  assert.equal(canUseAiRole('SUPER_ADMIN', []), true);
  assert.equal(canUseAiRole('ADMIN', []), true);
  assert.equal(canUseAiRole('EMPLOYEE', ['ai.use']), true);
  assert.equal(canUseAiRole('EMPLOYEE', ['ALL_ACCESS']), true);
  assert.equal(canUseAiRole('EMPLOYEE', []), false);
  assert.equal(canUseAiRole('PARTNER', ['ai.use']), false);
  assert.equal(canUseAiRole('CUSTOMER', ['ai.use']), false);
});

test('allows only Superadmin or explicitly permitted Employee to manage shared AI settings', () => {
  assert.equal(canManageAiSettingsRole('SUPER_ADMIN', []), true);
  assert.equal(canManageAiSettingsRole('EMPLOYEE', ['ai.manage']), true);
  assert.equal(canManageAiSettingsRole('EMPLOYEE', ['ALL_ACCESS']), true);
  assert.equal(canManageAiSettingsRole('EMPLOYEE', ['ai.use']), false);
  assert.equal(canManageAiSettingsRole('ADMIN', ['ai.manage']), false);
  assert.equal(canManageAiSettingsRole('PARTNER', ['ai.manage']), false);
});

test('returns 403 for Partner and Customer requests before any database lookup', async () => {
  for (const role of ['PARTNER', 'CUSTOMER'] as const) {
    const { response, state } = responseRecorder();
    let called = false;
    await requireAiAccess({ user: { id: `${role.toLowerCase()}-1`, role } } as Request, response, (() => { called = true; }) as NextFunction);
    assert.equal(called, false);
    assert.equal(state.statusCode, 403);
    assert.deepEqual(state.body, { error: 'AI access is restricted to internal operators.', code: 'AI_ACCESS_FORBIDDEN' });
  }
});

test('allows Admin requests without employee permission lookup', async () => {
  const { response } = responseRecorder();
  let called = false;
  await requireAiAccess({ user: { id: 'admin-1', role: 'ADMIN' } } as Request, response, (() => { called = true; }) as NextFunction);
  assert.equal(called, true);
});

test('keeps shared AI settings unavailable to Partner, Customer, and legacy Admin roles', async () => {
  for (const role of ['PARTNER', 'CUSTOMER', 'ADMIN'] as const) {
    const { response, state } = responseRecorder();
    let called = false;
    await requireAiSettingsManagement(
      { user: { id: `${role.toLowerCase()}-1`, role } } as Request,
      response,
      (() => { called = true; }) as NextFunction,
    );
    assert.equal(called, false);
    assert.equal(state.statusCode, 403);
    assert.deepEqual(state.body, {
      error: 'AI settings are restricted to authorised internal operators.',
      code: 'AI_SETTINGS_FORBIDDEN',
    });
  }
});
