import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPayrollReadiness } from './payroll-readiness';

test('payroll readiness reports the cross-module blockers without changing either master', () => {
  const result = buildPayrollReadiness([
    {
      id: 'hrm-1',
      employeeCode: 'EMP-001',
      legalName: 'Asha Singh',
      status: 'ACTIVE',
      userId: 'user-1',
      compensation: { status: 'APPROVED', effectiveFrom: '2026-01-01' },
      finance: { partyLinked: true, salaryProfile: true, salaryActive: true },
    },
    {
      id: 'hrm-2',
      employeeCode: 'EMP-002',
      legalName: 'Bharat Kumar',
      status: 'ONBOARDING',
      userId: null,
      compensation: null,
      finance: { partyLinked: false, salaryProfile: false, salaryActive: false },
    },
  ]);

  assert.deepEqual(result.summary, { total: 2, ready: 1, blocked: 1 });
  assert.deepEqual(result.items[0], {
    employeeId: 'hrm-1',
    employeeCode: 'EMP-001',
    legalName: 'Asha Singh',
    status: 'ACTIVE',
    readiness: 'READY',
    blockers: [],
  });
  assert.deepEqual(result.items[1], {
    employeeId: 'hrm-2',
    employeeCode: 'EMP-002',
    legalName: 'Bharat Kumar',
    status: 'ONBOARDING',
    readiness: 'BLOCKED',
    blockers: ['EMPLOYEE_NOT_ACTIVE', 'APPROVED_COMPENSATION_MISSING', 'FINANCE_PARTY_LINK_MISSING', 'FINANCE_SALARY_PROFILE_MISSING'],
  });
});

test('payroll readiness does not expose salary amounts or silently create finance records', () => {
  const result = buildPayrollReadiness([{
    id: 'hrm-3',
    employeeCode: 'EMP-003',
    legalName: 'Chitra Rao',
    status: 'ACTIVE',
    userId: 'user-3',
    compensation: { status: 'APPROVED', effectiveFrom: '2026-01-01', grossSalary: 90000 },
    finance: { partyLinked: true, salaryProfile: false, salaryActive: false },
  }]);

  assert.deepEqual(result.items[0]?.blockers, ['FINANCE_SALARY_PROFILE_MISSING']);
  assert.equal(JSON.stringify(result).includes('90000'), false);
});
