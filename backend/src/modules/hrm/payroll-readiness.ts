export type PayrollReadinessInput = {
  id: string;
  employeeCode: string;
  legalName: string;
  status: string;
  userId: string | null;
  compensation: {
    status: string;
    effectiveFrom: string | Date;
    grossSalary?: unknown;
  } | null;
  finance: {
    partyLinked: boolean;
    salaryProfile: boolean;
    salaryActive: boolean;
  };
};

export type PayrollReadinessItem = {
  employeeId: string;
  employeeCode: string;
  legalName: string;
  status: string;
  readiness: 'READY' | 'BLOCKED';
  blockers: string[];
};

export type PayrollReadinessResult = {
  summary: { total: number; ready: number; blocked: number };
  items: PayrollReadinessItem[];
};

/**
 * Describes the safe hand-off from HRM to Finance Hub payroll.
 * This is intentionally read-only: it never creates a User, FinParty or salary profile.
 */
export const buildPayrollReadiness = (employees: readonly PayrollReadinessInput[]): PayrollReadinessResult => {
  const items = employees.map<PayrollReadinessItem>((employee) => {
    const blockers: string[] = [];
    if (employee.status !== 'ACTIVE') blockers.push('EMPLOYEE_NOT_ACTIVE');
    if (!employee.compensation || employee.compensation.status !== 'APPROVED') blockers.push('APPROVED_COMPENSATION_MISSING');
    if (!employee.finance.partyLinked) blockers.push('FINANCE_PARTY_LINK_MISSING');
    if (!employee.finance.salaryProfile) blockers.push('FINANCE_SALARY_PROFILE_MISSING');
    if (employee.finance.salaryProfile && !employee.finance.salaryActive) blockers.push('FINANCE_SALARY_PROFILE_INACTIVE');

    return {
      employeeId: employee.id,
      employeeCode: employee.employeeCode,
      legalName: employee.legalName,
      status: employee.status,
      readiness: blockers.length === 0 ? 'READY' : 'BLOCKED',
      blockers,
    };
  });

  const ready = items.filter((item) => item.readiness === 'READY').length;
  return { summary: { total: items.length, ready, blocked: items.length - ready }, items };
};
