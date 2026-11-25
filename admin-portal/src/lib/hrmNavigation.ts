export const HRM_WORKSPACE_SECTIONS = ['attendance', 'leave', 'compensation', 'performance', 'exit'] as const;

export type HrmWorkspaceSection = (typeof HRM_WORKSPACE_SECTIONS)[number];

export const HRM_PAYROLL_MODULES = [
  { key: 'employee-salary', label: 'Employee Salary' },
  { key: 'salary-structure', label: 'Salary Structure' },
  { key: 'payroll-processing', label: 'Payroll Processing' },
  { key: 'advances-deductions', label: 'Advances & Deductions' },
  { key: 'payslips', label: 'Payslips' },
  { key: 'statutory-contributions', label: 'Statutory Contributions' },
  { key: 'full-final-settlement', label: 'Full & Final Settlement' },
] as const;

export type HrmPayrollModuleKey = (typeof HRM_PAYROLL_MODULES)[number]['key'];

export const isHrmWorkspaceSection = (value: string): value is HrmWorkspaceSection =>
  (HRM_WORKSPACE_SECTIONS as readonly string[]).includes(value);

export const isHrmPayrollModuleKey = (value: string): value is HrmPayrollModuleKey =>
  HRM_PAYROLL_MODULES.some((module) => module.key === value);

export const getHrmWorkspacePath = (portal: 'admin' | 'employee', section: HrmWorkspaceSection) =>
  `/${portal}/hrm/${section}`;

export const getHrmPayrollPath = (portal: 'admin' | 'employee', module: HrmPayrollModuleKey) =>
  `/${portal}/hrm/payroll/${module}`;
