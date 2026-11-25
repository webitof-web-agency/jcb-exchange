import assert from 'node:assert/strict';
import test from 'node:test';

import { getHrmPayrollPath, getHrmWorkspacePath, HRM_PAYROLL_MODULES } from './hrmNavigation';

test('HRM workspace links keep operational modules inside the HRM area', () => {
  assert.equal(getHrmWorkspacePath('employee', 'attendance'), '/employee/hrm/attendance');
  assert.equal(getHrmWorkspacePath('admin', 'exit'), '/admin/hrm/exit');
});

test('HRM payroll links use the shared payroll workspace rather than a duplicate data route', () => {
  assert.equal(getHrmPayrollPath('admin', 'employee-salary'), '/admin/hrm/payroll/employee-salary');
  assert.deepEqual(HRM_PAYROLL_MODULES.map((item) => item.key), [
    'employee-salary', 'salary-structure', 'payroll-processing', 'advances-deductions', 'payslips', 'statutory-contributions', 'full-final-settlement',
  ]);
});
