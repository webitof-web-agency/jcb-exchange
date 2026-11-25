export const HRM_PERMISSIONS = {
  EMPLOYEES_READ: 'hrm.employees.read',
  EMPLOYEES_MANAGE: 'hrm.employees.manage',
  ORG_READ: 'hrm.org.read',
  ORG_MANAGE: 'hrm.org.manage',
  ASSIGNMENTS_MANAGE: 'hrm.assignments.manage',
  ONBOARDING_READ: 'hrm.onboarding.read',
  ONBOARDING_MANAGE: 'hrm.onboarding.manage',
  DOCUMENTS_READ: 'hrm.documents.read',
  DOCUMENTS_MANAGE: 'hrm.documents.manage',
  DOCUMENTS_VERIFY: 'hrm.documents.verify',
  ATTENDANCE_READ: 'hrm.attendance.read',
  ATTENDANCE_MANAGE: 'hrm.attendance.manage',
  LEAVE_READ: 'hrm.leave.read',
  LEAVE_MANAGE: 'hrm.leave.manage',
  LEAVE_APPROVE: 'hrm.leave.approve',
  COMPENSATION_READ: 'hrm.compensation.read',
  COMPENSATION_MANAGE: 'hrm.compensation.manage',
  /** Approve or reject a salary revision (a different person from the one who proposed it). */
  COMPENSATION_APPROVE: 'hrm.compensation.approve',
  PERFORMANCE_READ: 'hrm.performance.read',
  PERFORMANCE_MANAGE: 'hrm.performance.manage',
  INCENTIVE_READ: 'hrm.incentive.read',
  INCENTIVE_MANAGE: 'hrm.incentive.manage',
  EXIT_READ: 'hrm.exit.read',
  EXIT_MANAGE: 'hrm.exit.manage',
  SCOPE_MANAGE: 'hrm.scope.manage',
  SCOPE_ALL: 'hrm.scope.all',
  AUDIT_READ: 'hrm.audit.read',
} as const;

export type HrmPermission = (typeof HRM_PERMISSIONS)[keyof typeof HRM_PERMISSIONS];

export type HrmScopeType =
  | 'OWN'
  | 'DIRECT_REPORTS'
  | 'TEAM'
  | 'DEPARTMENT'
  | 'REGION'
  | 'STATE'
  | 'HEAD_OFFICE'
  | 'ALL_INDIA';

export type HrmScopeDescriptor = {
  scopeType: HrmScopeType;
  orgUnitId?: string | null;
  operationalRegionId?: string | null;
  stateId?: number | null;
  includeChildren: boolean;
};

export type HrmAssignmentDescriptor = {
  employeeId: string;
  managerEmployeeId?: string | null;
  orgUnitId: string;
  /** The office (head office / state office) the person works from; orgUnitId is the department. */
  officeUnitId?: string | null;
  parentOrgUnitIds?: string[];
  operationalRegionId?: string | null;
  stateId?: number | null;
  /** The person works from the head office: a STATE scope does not cover them (HEAD_OFFICE / ALL_INDIA does). */
  officeIsHeadOffice?: boolean;
};

/**
 * The same rule as every other route guard and the signed-in session (so the menu and the server agree): the custom
 * role's permissions when the login has a role (null = no role), otherwise the login's direct grants.
 */
export const resolveHrmPermissions = (
  role: string,
  customRolePermissions: readonly string[] | null,
  directPermissions: readonly string[],
): Set<string> => {
  if (role === 'SUPER_ADMIN') return new Set(['ALL_ACCESS']);
  return new Set(customRolePermissions ?? directPermissions);
};

export const hasHrmPermission = (permissions: ReadonlySet<string>, permission: string): boolean => (
  permissions.has('ALL_ACCESS') || permissions.has(permission)
);

/** True when one of the user's active access scopes is ALL_INDIA (Director / Super Admin style access to every employee). */
export const hasAllIndiaScope = (scopes: ReadonlyArray<{ scopeType: string }>): boolean => scopes.some((scope) => scope.scopeType === 'ALL_INDIA');

export const canAccessHrmAssignment = (
  assignment: HrmAssignmentDescriptor,
  actorEmployeeId: string,
  scopes: readonly HrmScopeDescriptor[],
): boolean => scopes.some((scope) => {
  switch (scope.scopeType) {
    case 'ALL_INDIA':
      return true;
    case 'OWN':
      return assignment.employeeId === actorEmployeeId;
    case 'DIRECT_REPORTS':
      return assignment.managerEmployeeId === actorEmployeeId;
    case 'TEAM':
    case 'DEPARTMENT':
      if (!scope.orgUnitId) return false;
      return assignment.orgUnitId === scope.orgUnitId
        || (scope.includeChildren && assignment.parentOrgUnitIds?.includes(scope.orgUnitId) === true);
    case 'REGION':
      return Boolean(scope.operationalRegionId)
        && assignment.operationalRegionId === scope.operationalRegionId;
    case 'STATE':
      return scope.stateId !== null && scope.stateId !== undefined && assignment.stateId === scope.stateId && !assignment.officeIsHeadOffice;
    case 'HEAD_OFFICE':
      return Boolean(scope.orgUnitId) && (assignment.officeUnitId === scope.orgUnitId || assignment.orgUnitId === scope.orgUnitId);
    default:
      return false;
  }
});

const REDACTED_KEYS = new Set([
  'accountNumber',
  'encryptedAccountNumber',
  'accessToken',
  'refreshToken',
  'token',
  'signatureFileRef',
  'signatureHash',
  'fileRef',
  'driveFileId',
  'providerReference',
  'verificationRecordId',
  'aadhaarNumber',
  'panNumber',
]);

export const redactHrmAuditPayload = (value: unknown): unknown => {
  // A Date has no own entries, so it would be written as {}: keep it readable.
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(redactHrmAuditPayload);
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [
    key,
    REDACTED_KEYS.has(key) ? '[REDACTED]' : redactHrmAuditPayload(entry),
  ]));
};
