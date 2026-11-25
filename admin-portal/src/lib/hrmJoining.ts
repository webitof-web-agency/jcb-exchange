import type {
  HrmConfirmJoiningPayload,
  HrmEmployeeAccess,
  HrmGrantedScope,
  HrmJoiningContext,
  HrmLinkableUser,
  HrmScopeType,
  HrmSuggestedScope,
} from './hrmApi';
import { isValidEmail, normalizeMobile } from './hrmOnboarding';

/**
 * Confirm joining (Phase 5): the person turned up. HR records the actual date, creates the login by hand (or links /
 * re-uses one, or none with a reason), and confirms the HRM access the placement suggests. Pure helpers for the
 * dialog and the Access card; the backend applies the same rules (joining.service.ts, joiningRules.ts).
 */

export type JoiningLoginMode = 'CREATE' | 'LINK' | 'KEEP' | 'NONE';

export type JoiningForm = {
  joiningDate: string;
  loginMode: JoiningLoginMode;
  email: string;
  mobile: string;
  password: string;
  roleId: string;
  linkUser: HrmLinkableUser | null;
  keepReactivate: boolean;
  keepSetPassword: boolean;
  keepPassword: string;
  keepChangeRole: boolean;
  keepRoleId: string;
  noneReason: string;
  /** Keys (scopeKey) of the suggested scopes that are ticked. */
  scopeKeys: string[];
  overrideReason: string;
  /** Send the joining welcome (email / WhatsApp / SMS, as switched on in Settings). Off unless HR ticks it. */
  sendWelcome: boolean;
};

/** The confirm-joining body: the server schema (strict) also takes sendWelcome, sent only when it is true. */
export type ConfirmJoiningRequest = HrmConfirmJoiningPayload & { sendWelcome?: true };

export type JoiningErrors = Partial<Record<'joiningDate' | 'email' | 'mobile' | 'password' | 'linkUser' | 'keepPassword' | 'noneReason' | 'overrideReason' | 'loginMode', string>>;

export const JOINING_STATUSES = new Set(['DRAFT', 'PRE_ONBOARDING', 'ONBOARDING']);
/** Onboarding-case statuses whose person can be confirmed as joined from the Onboarding page. */
export const CONFIRMABLE_CASE_STATUSES = new Set(['PENDING', 'IN_PROGRESS', 'READY_FOR_APPROVAL']);

export const LOGIN_PASSWORD_MIN = 8;
export const LOGIN_PASSWORD_MAX_BYTES = 72;

export const scopeKey = (scope: { scopeType: string; stateId?: number | null; orgUnitId?: string | null }) =>
  `${scope.scopeType}:${scope.stateId ?? ''}:${scope.orgUnitId ?? ''}`;

/** Planned date when it is not later than today (India), otherwise today. */
export const defaultJoiningDate = (planned: string | null, today: string) => (planned && planned <= today ? planned : today);

/** Why a login option cannot be chosen (null = it can). */
export const loginModeBlock = (mode: JoiningLoginMode, context: Pick<HrmJoiningContext, 'login' | 'abilities'>): string | null => {
  const hasLogin = Boolean(context.login);
  switch (mode) {
    case 'CREATE':
      if (hasLogin) return 'This person already has a login.';
      return context.abilities.canCreateLogin ? null : 'Creating a login needs the users.create permission.';
    case 'LINK':
      if (hasLogin) return 'This person already has a login.';
      return context.abilities.canLinkLogin ? null : 'Linking a login needs the users.read permission.';
    case 'KEEP':
      return hasLogin ? null : 'This person has no login yet.';
    case 'NONE':
      return null;
    default:
      return null;
  }
};

/** Why a suggested access cannot be given by this person / in this state of the form (null = it can). */
export const scopeBlock = (
  scope: Pick<HrmSuggestedScope, 'scopeType' | 'stateId'>,
  abilities: { canManageScopes: boolean; allIndia: boolean },
  loginMode: JoiningLoginMode,
): string | null => {
  if (loginMode === 'NONE') return 'HRM access needs a login.';
  if (!abilities.canManageScopes) return 'Giving HRM access needs the hrm.scope.manage permission.';
  if ((scope.scopeType === 'ALL_INDIA' || scope.scopeType === 'HEAD_OFFICE') && !abilities.allIndia) return 'Only somebody with all-India access can give this.';
  return null;
};

export const createJoiningForm = (context: HrmJoiningContext): JoiningForm => {
  const firstMode: JoiningLoginMode = context.login
    ? 'KEEP'
    : (['CREATE', 'LINK', 'NONE'] as const).find((mode) => !loginModeBlock(mode, context)) ?? 'NONE';
  return {
    joiningDate: defaultJoiningDate(context.employee.plannedJoiningDate, context.today),
    loginMode: firstMode,
    email: '',
    mobile: context.employee.mobile ?? '',
    password: '',
    roleId: context.suggestedRoleId ?? '',
    linkUser: null,
    keepReactivate: Boolean(context.login && context.login.status !== 'ACTIVE'),
    keepSetPassword: false,
    keepPassword: '',
    keepChangeRole: false,
    keepRoleId: context.login?.customRole?.id ?? '',
    noneReason: '',
    scopeKeys: context.suggestedScopes
      .filter((scope) => scope.recommended && !scopeBlock(scope, context.abilities, firstMode))
      .map(scopeKey),
    overrideReason: '',
    sendWelcome: false,
  };
};

const passwordProblem = (value: string) => {
  if (value.length < LOGIN_PASSWORD_MIN) return `Password must be at least ${LOGIN_PASSWORD_MIN} characters long.`;
  if (new TextEncoder().encode(value).length > LOGIN_PASSWORD_MAX_BYTES) return `Password is too long (${LOGIN_PASSWORD_MAX_BYTES} bytes at most; accented characters count as more than one).`;
  return null;
};

export const validateJoiningForm = (form: JoiningForm, context: HrmJoiningContext): JoiningErrors => {
  const errors: JoiningErrors = {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.joiningDate)) errors.joiningDate = 'Enter the date the person actually joined.';
  else if (form.joiningDate > context.today) errors.joiningDate = 'The joining date cannot be in the future.';

  const block = loginModeBlock(form.loginMode, context);
  if (block) errors.loginMode = block;
  if (form.loginMode === 'CREATE') {
    if (!form.email.trim()) errors.email = 'Enter the work email for the login.';
    else if (!isValidEmail(form.email)) errors.email = 'Enter a valid email address.';
    if (form.mobile.trim() && normalizeMobile(form.mobile).length !== 10) errors.mobile = 'Enter a valid 10-digit mobile number, or leave it empty.';
    const problem = passwordProblem(form.password);
    if (problem) errors.password = problem;
  }
  if (form.loginMode === 'LINK' && !form.linkUser) errors.linkUser = 'Choose the login to link.';
  if (form.loginMode === 'KEEP' && form.keepSetPassword) {
    const problem = passwordProblem(form.keepPassword);
    if (problem) errors.keepPassword = problem;
  }
  if (form.loginMode === 'NONE' && form.noneReason.trim().length < 3) errors.noneReason = 'Say why no login is made now (for example: field staff without a phone).';
  if (context.progress.missingRequired.length && form.overrideReason.trim().length < 3) {
    errors.overrideReason = 'The checklist is not complete: give the reason to confirm anyway.';
  }
  return errors;
};

/** The scopes the form will grant (ticked, and allowed). */
export const selectedScopes = (form: JoiningForm, context: Pick<HrmJoiningContext, 'suggestedScopes' | 'abilities'>): HrmGrantedScope[] =>
  context.suggestedScopes
    .filter((scope) => form.scopeKeys.includes(scopeKey(scope)) && !scopeBlock(scope, context.abilities, form.loginMode))
    .map((scope) => ({
      scopeType: scope.scopeType,
      ...(scope.stateId ? { stateId: scope.stateId } : {}),
      ...(scope.orgUnitId ? { orgUnitId: scope.orgUnitId } : {}),
      source: scope.source,
    }));

export const buildConfirmJoiningPayload = (form: JoiningForm, context: HrmJoiningContext): ConfirmJoiningRequest => {
  let login: HrmConfirmJoiningPayload['login'];
  if (form.loginMode === 'CREATE') {
    const mobile = form.mobile.trim() ? normalizeMobile(form.mobile) : '';
    login = { mode: 'CREATE', email: form.email.trim(), password: form.password, ...(mobile ? { mobile } : {}), ...(form.roleId ? { customRoleId: form.roleId } : {}) };
  } else if (form.loginMode === 'LINK') {
    login = { mode: 'LINK', userId: form.linkUser?.id ?? '' };
  } else if (form.loginMode === 'KEEP') {
    login = {
      mode: 'KEEP',
      ...(form.keepReactivate && context.login && context.login.status !== 'ACTIVE' ? { reactivate: true } : {}),
      ...(form.keepSetPassword ? { newPassword: form.keepPassword } : {}),
      ...(form.keepChangeRole ? { customRoleId: form.keepRoleId || null } : {}),
    };
  } else {
    login = { mode: 'NONE', reason: form.noneReason.trim() };
  }
  const scopes = form.loginMode === 'NONE' ? [] : selectedScopes(form, context);
  return {
    version: context.employee.version,
    joiningDate: form.joiningDate,
    login,
    ...(scopes.length ? { scopes } : {}),
    ...(context.progress.missingRequired.length ? { overrideReason: form.overrideReason.trim() } : {}),
    ...(form.sendWelcome === true ? { sendWelcome: true as const } : {}),
  };
};

/** Maps the server's field details (and well-known messages) onto the dialog's fields. */
export const joiningErrorsFromServer = (error: unknown): { fields: JoiningErrors; banner: string | null } => {
  const data = (error as { response?: { data?: { error?: unknown; code?: unknown; details?: unknown } } } | null)?.response?.data;
  const fields: JoiningErrors = {};
  const message = typeof data?.error === 'string' ? data.error : null;
  if (Array.isArray(data?.details)) {
    for (const detail of data.details as Array<{ path?: unknown; message?: unknown }>) {
      if (typeof detail?.message !== 'string') continue;
      const path = Array.isArray(detail.path) ? detail.path.map(String) : typeof detail.path === 'string' ? detail.path.split('.') : [];
      const [first, second] = path;
      if (first === 'joiningDate') fields.joiningDate ??= detail.message;
      else if (first === 'overrideReason') fields.overrideReason ??= detail.message;
      else if (first === 'login' && second === 'email') fields.email ??= detail.message;
      else if (first === 'login' && second === 'mobile') fields.mobile ??= detail.message;
      else if (first === 'login' && (second === 'password')) fields.password ??= detail.message;
      else if (first === 'login' && second === 'newPassword') fields.keepPassword ??= detail.message;
      else if (first === 'login' && second === 'reason') fields.noneReason ??= detail.message;
    }
  }
  if (message && !Object.keys(fields).length) {
    if (/email/i.test(message) && /use|valid/i.test(message)) fields.email = message;
    else if (/mobile/i.test(message)) fields.mobile = message;
  }
  const banner = Object.keys(fields).length ? null : message;
  return { fields, banner };
};

// ---- labels ----

export const SCOPE_TYPE_LABELS: Record<HrmScopeType, string> = {
  OWN: 'Own record',
  DIRECT_REPORTS: 'Direct reports',
  TEAM: 'Team',
  DEPARTMENT: 'Department',
  REGION: 'Region',
  STATE: 'State',
  HEAD_OFFICE: 'Head office',
  ALL_INDIA: 'All of India',
};

export const describeScope = (scope: Pick<HrmEmployeeAccess['scopes'][number], 'scopeType' | 'state' | 'orgUnit'>) => {
  const base = SCOPE_TYPE_LABELS[scope.scopeType] ?? scope.scopeType;
  if (scope.scopeType === 'STATE' && scope.state) return `${base}: ${scope.state.name}`;
  if (scope.orgUnit && scope.scopeType !== 'ALL_INDIA') return `${base}: ${scope.orgUnit.name}`;
  return base;
};

export const scopePeriodState = (scope: Pick<HrmEmployeeAccess['scopes'][number], 'isActive' | 'isUpcoming'>) =>
  scope.isActive ? 'ACTIVE' : scope.isUpcoming ? 'UPCOMING' : 'ENDED';

/** Scope types the granter may give from the Access card (the server enforces the same). */
export const grantableScopeTypes = (abilities: { canManageScopes: boolean; allIndia: boolean }): HrmScopeType[] => {
  if (!abilities.canManageScopes) return [];
  return abilities.allIndia ? ['STATE', 'HEAD_OFFICE', 'ALL_INDIA', 'DIRECT_REPORTS'] : ['STATE', 'DIRECT_REPORTS'];
};

export const JOINING_LOGIN_LABELS: Record<JoiningLoginMode, string> = {
  CREATE: 'Create a login',
  LINK: 'Link an existing login',
  KEEP: 'Use their login',
  NONE: 'No login for now',
};
