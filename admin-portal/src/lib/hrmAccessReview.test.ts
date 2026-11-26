import assert from 'node:assert/strict';
import test from 'node:test';
import { describeHrmAccess, issueLink, toAccessReviewQuery } from './hrmAccessReview';

const person = { userId: 'u1', employeeId: 'e1', employeeCode: 'EMP-0001', name: 'Ravi' };
const office = { id: 'o1', name: 'Gujarat State Office' };

test('each problem opens where it is fixed', () => {
  assert.deepEqual(issueLink({ code: 'MANAGER_NO_ACCESS', person, office, jobId: null }, 'admin'), { href: '/admin/hrm/e1', label: 'Open profile' });
  assert.equal(issueLink({ code: 'VACANT_OFFICE', person: null, office, jobId: null }, 'employee')?.href, '/employee/hrm/organisation/offices/o1');
  assert.equal(issueLink({ code: 'CHARGE_ENDING', person, office, jobId: null }, 'admin')?.href, '/admin/hrm/organisation/offices/o1');
  assert.equal(issueLink({ code: 'JOB_NO_STATE', person: null, office: null, jobId: 'j1' }, 'admin')?.href, '/admin/recruitment/jobs?edit=j1');
  assert.equal(issueLink({ code: 'STALE_ACCESS', person: { ...person, employeeId: null }, office: null, jobId: null }, 'admin')?.href, '/admin/users');
});

test('access is described in words', () => {
  const base = { allIndia: false, states: [], headOffice: false, directReports: false, other: false };
  assert.deepEqual(describeHrmAccess(base), ['Own record only']);
  assert.deepEqual(describeHrmAccess({ ...base, allIndia: true, states: [{ id: 1, name: 'Goa' }] }), ['All of India']);
  assert.deepEqual(describeHrmAccess({ ...base, states: [{ id: 1, name: 'Goa' }], directReports: true }), ['Goa', 'Direct reports']);
});

test('the query carries only the filters in use; the issue type applies to problems only', () => {
  assert.deepEqual(toAccessReviewQuery({ view: 'issues', issue: 'VACANT_OFFICE', search: '  ', stateId: '', page: 2 }), { view: 'issues', issue: 'VACANT_OFFICE', page: 2, limit: 25 });
  assert.deepEqual(toAccessReviewQuery({ view: 'people', issue: 'VACANT_OFFICE', search: ' ravi ', stateId: '4030', page: 1 }), { view: 'people', page: 1, limit: 25, search: 'ravi', stateId: 4030 });
});
