import assert from 'node:assert/strict';
import test from 'node:test';
import { buildJoiningWelcomePayload, welcomeContact } from './joiningWelcome';
import { schemas } from './validation';

test('welcome goes to the personal email first, then the work / login email', () => {
  assert.deepEqual(welcomeContact({ personalEmail: ' priya@gmail.com ', workEmail: 'priya@jcb.example', mobile: ' 9876543210 ' }), { email: 'priya@gmail.com', phone: '9876543210' });
  assert.deepEqual(welcomeContact({ personalEmail: null, workEmail: 'priya@jcb.example', mobile: null }), { email: 'priya@jcb.example', phone: null });
  assert.deepEqual(welcomeContact({ personalEmail: ' ', workEmail: null, mobile: '' }), { email: null, phone: null });
});

test('welcome payload: preferred name, empty strings for what is not known', () => {
  const employee = { legalName: 'Priya Ramesh Sharma', preferredName: 'Priya Sharma', employeeCode: 'JCB-0042' };
  assert.deepEqual(buildJoiningWelcomePayload({ employee, joiningDate: '2026-11-26', designation: 'Sales Executive', officeName: 'Maharashtra State Office', loginEmail: 'priya@jcb.example' }), {
    employeeName: 'Priya Sharma', employeeCode: 'JCB-0042', designation: 'Sales Executive', joiningDate: '2026-11-26',
    officeName: 'Maharashtra State Office', loginEmail: 'priya@jcb.example',
  });
  assert.deepEqual(buildJoiningWelcomePayload({ employee: { ...employee, preferredName: null }, joiningDate: '2026-11-26', designation: undefined, officeName: null, loginEmail: null }), {
    employeeName: 'Priya Ramesh Sharma', employeeCode: 'JCB-0042', designation: '', joiningDate: '2026-11-26', officeName: '', loginEmail: '',
  });
});

test('Confirm joining accepts sendWelcome (a boolean) and still refuses unknown fields', () => {
  const base = { version: 3, joiningDate: '2026-11-26', login: { mode: 'NONE', reason: 'Field staff, no portal use' } };
  assert.equal(schemas.confirmJoining.parse(base).sendWelcome, undefined);
  assert.equal(schemas.confirmJoining.parse({ ...base, sendWelcome: true }).sendWelcome, true);
  assert.equal(schemas.confirmJoining.safeParse({ ...base, sendWelcome: 'yes' }).success, false);
  assert.equal(schemas.confirmJoining.safeParse({ ...base, sendWelcomeEmail: true }).success, false);
});
