export const ADMINISTRATION_AI_PAGE_KEYS = ['users', 'roles', 'settings', 'whatsapp', 'sms'] as const;

export type AdministrationAiPageKey = (typeof ADMINISTRATION_AI_PAGE_KEYS)[number];

type PageContext = { moduleKey?: string | null | undefined };

const PAGE_ALIASES: ReadonlyArray<readonly [AdministrationAiPageKey, readonly string[]]> = [
  ['roles', ['roles', 'role list', 'user roles', 'permissions', 'permission matrix', 'access control']],
  ['users', ['users', 'user list', 'user accounts', 'team members', 'admins', 'employees']],
  ['settings', ['platform settings', 'system settings', 'admin settings', 'application settings', 'configuration settings']],
  ['whatsapp', ['whatsapp', 'whatsapp api', 'whatsapp campaigns', 'whatsapp templates', 'whatsapp logs', 'whatsapp delivery']],
  ['sms', ['sms', 'sms notifications', 'sms logs', 'sms templates', 'sms delivery', 'text messages']],
];

const QUESTION_KEYS: Record<AdministrationAiPageKey, readonly string[]> = {
  users: [
    'administration.users.list',
    'administration.users.status_breakdown',
    'administration.users.role_breakdown',
    'administration.users.recent_accounts',
    'administration.users.access_readiness',
  ],
  roles: [
    'administration.roles.list',
    'administration.roles.permission_coverage',
    'administration.roles.assignment_counts',
    'administration.roles.unused_roles',
    'administration.roles.access_risk',
  ],
  settings: [
    'administration.settings.overview',
    'administration.settings.integration_readiness',
    'administration.settings.authentication',
    'administration.settings.payment_configuration',
    'administration.settings.updated_sections',
  ],
  whatsapp: [
    'administration.whatsapp.integration_status',
    'administration.whatsapp.delivery_summary',
    'administration.whatsapp.templates',
    'administration.whatsapp.automation_rules',
    'administration.whatsapp.campaigns',
    'administration.whatsapp.recent_logs',
  ],
  sms: [
    'administration.sms.integration_status',
    'administration.sms.delivery_summary',
    'administration.sms.automation_rules',
    'administration.sms.recent_logs',
    'administration.sms.failure_analysis',
  ],
};

const PAGE_PERMISSIONS: Record<AdministrationAiPageKey, readonly string[]> = {
  users: ['users.read', 'MANAGE_ADMINS'],
  roles: ['users.read', 'roles.read', 'MANAGE_ADMINS'],
  settings: ['settings.manage', 'crm.settings', 'ai.manage'],
  whatsapp: ['whatsapp.read', 'whatsapp.manage'],
  sms: ['sms.read', 'sms.manage'],
};

const normalize = (message: string) => message
  .toLocaleLowerCase('en-IN')
  .replace(/\u092f\u0942\u091c\u0930\u094d\u0938/gu, 'users')
  .replace(/\u0938\u0947\u091f\u093f\u0902\u0917\u094d\u0938?/gu, 'settings')
  .replace(/whatss*app/gu, 'whatsapp')
  .replace(/notificaton/gu, 'notification')
  .replace(/permisions?/gu, 'permissions')
  .replace(/\s+/gu, ' ')
  .trim();

export const isAdministrationAiPageKey = (value: string | null | undefined): value is AdministrationAiPageKey =>
  Boolean(value && (ADMINISTRATION_AI_PAGE_KEYS as readonly string[]).includes(value));

export const administrationPageKeyFor = (
  message: string,
  context: PageContext = {},
): AdministrationAiPageKey | null => {
  if (isAdministrationAiPageKey(context.moduleKey)) return context.moduleKey;
  const normalized = normalize(message);
  if (!normalized) return null;
  for (const [key, aliases] of PAGE_ALIASES) {
    if (aliases.some((alias) => normalized.includes(alias))) return key;
  }
  if (/\b(user|users|role|roles|permission|settings?|configuration|whatsapp|sms|notification)\b/u.test(normalized)) {
    return normalized.includes('whatsapp') ? 'whatsapp' : normalized.includes('sms') ? 'sms' : 'users';
  }
  return null;
};

export const administrationPageQuestionKeys = (pageKey: AdministrationAiPageKey): readonly string[] => QUESTION_KEYS[pageKey];
export const administrationPagePermissionsFor = (pageKey: AdministrationAiPageKey): readonly string[] => PAGE_PERMISSIONS[pageKey];
