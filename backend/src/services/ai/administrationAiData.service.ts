import prisma from '../../lib/prisma';
import {
  administrationPagePermissionsFor,
  administrationPageQuestionKeys,
  type AdministrationAiPageKey,
} from './administrationAiPage.service';

export type AdministrationPageArguments = {
  pageKey: AdministrationAiPageKey;
  days?: number;
  limit?: number;
};

const boundedDays = (days: number | undefined) => Math.min(90, Math.max(1, Math.floor(days ?? 30)));
const boundedLimit = (limit: number | undefined) => Math.min(20, Math.max(1, Math.floor(limit ?? 10)));
const iso = (value: Date | null | undefined) => value?.toISOString() || null;
const fromDays = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000);

const insightFor = (pageKey: AdministrationAiPageKey, data: Record<string, unknown>) => ({
  pageKey,
  generatedFrom: 'live_database',
  confidence: 'high',
  observations: pageKey === 'users'
    ? ['User status, role distribution, recent account creation, and access readiness are included.']
    : pageKey === 'roles'
      ? ['Custom-role assignment and permission coverage are included; protected credentials are never part of this contract.']
      : pageKey === 'settings'
        ? ['Configuration readiness is shown as status flags and timestamps; secret values and raw provider payloads are excluded.']
        : ['Delivery status, configuration readiness, automation, and recent operational activity are included.'],
  suggestions: data.hasFailures
    ? ['Review failed delivery records and provider configuration before enabling additional automation.']
    : ['Ask for a period comparison or a page-specific breakdown for a focused operational review.'],
});

const usersPage = async (limit: number) => {
  const [total, byRole, byStatus, recent] = await Promise.all([
    prisma.user.count(),
    prisma.user.groupBy({ by: ['role'], _count: { _all: true } }),
    prisma.user.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { role: true, status: true, authProvider: true, createdAt: true, customRole: { select: { name: true } } },
    }),
  ]);
  return {
    total,
    byRole: byRole.map((row) => ({ role: row.role, count: row._count._all })),
    byStatus: byStatus.map((row) => ({ status: row.status, count: row._count._all })),
    recent: recent.map((row) => ({ role: row.role, status: row.status, authProvider: row.authProvider || 'LOCAL', customRole: row.customRole?.name || null, createdAt: iso(row.createdAt) })),
    maskedFields: ['userId', 'name', 'fullName', 'email', 'mobile', 'whatsappNumber', 'password', 'fcmToken', 'pushSubscription'],
  };
};

const rolesPage = async (limit: number) => {
  const [roles, assignedUsers] = await Promise.all([
    prisma.customRole.findMany({ orderBy: { name: 'asc' }, take: limit, select: { name: true, description: true, permissions: true, _count: { select: { users: true } } } }),
    prisma.user.groupBy({ by: ['customRoleId'], where: { customRoleId: { not: null } }, _count: { _all: true } }),
  ]);
  return {
    totalRoles: roles.length,
    roles: roles.map((role) => ({ name: role.name, description: role.description, permissionCount: role.permissions.length, assignedUsers: role._count.users, permissions: role.permissions })),
    assignedUsers: assignedUsers.length,
    unusedRoles: roles.filter((role) => role._count.users === 0).map((role) => role.name),
    maskedFields: ['userId', 'permission grants for protected/system roles'],
  };
};

const settingsPage = async () => {
  const [runtime, whatsapp, sms] = await Promise.all([
    prisma.platformRuntimeSettings.findMany({ select: { key: true, updatedAt: true }, orderBy: { key: 'asc' } }),
    prisma.whatsAppIntegrationSettings.findUnique({ where: { id: 'default' }, select: { enabled: true, graphApiVersion: true, phoneNumberId: true, businessAccountId: true, encryptedAccessToken: true, encryptedWebhookVerifyToken: true, encryptedAppSecret: true, updatedAt: true } }),
    prisma.smsIntegrationSettings.findUnique({ where: { id: 'default' }, select: { enabled: true, baseUrl: true, senderId: true, encryptedApiKey: true, updatedAt: true } }),
  ]);
  const sections = runtime.map((row) => ({ key: row.key, configured: true, updatedAt: iso(row.updatedAt) }));
  return {
    sections,
    integrations: {
      whatsapp: { enabled: Boolean(whatsapp?.enabled), ready: Boolean(whatsapp?.enabled && whatsapp.phoneNumberId && whatsapp.businessAccountId && whatsapp.encryptedAccessToken && whatsapp.encryptedWebhookVerifyToken && whatsapp.encryptedAppSecret), graphApiVersion: whatsapp?.graphApiVersion || null, updatedAt: iso(whatsapp?.updatedAt) },
      sms: { enabled: Boolean(sms?.enabled), ready: Boolean(sms?.enabled && sms.senderId && sms.encryptedApiKey), baseUrlConfigured: Boolean(sms?.baseUrl), updatedAt: iso(sms?.updatedAt) },
    },
    configuredSectionCount: sections.length,
    maskedFields: ['payload', 'apiKey', 'encryptedApiKey', 'accessToken', 'webhookVerifyToken', 'appSecret', 'clientSecret', 'refreshToken', 'password', 'otp'],
  };
};

const whatsappPage = async (days: number, limit: number) => {
  const from = fromDays(days);
  const [settings, templates, rules, campaigns, total, byStatus, events, recent] = await Promise.all([
    prisma.whatsAppIntegrationSettings.findUnique({ where: { id: 'default' }, select: { enabled: true, graphApiVersion: true, phoneNumberId: true, businessAccountId: true, encryptedAccessToken: true, encryptedWebhookVerifyToken: true, encryptedAppSecret: true, updatedAt: true } }),
    prisma.whatsAppMetaTemplate.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.whatsAppAutomationRule.groupBy({ by: ['enabled'], _count: { _all: true } }),
    prisma.whatsAppCampaign.findMany({ orderBy: { createdAt: 'desc' }, take: limit, select: { name: true, category: true, status: true, createdAt: true, template: { select: { name: true, language: true } }, _count: { select: { recipients: true } } } }),
    prisma.whatsAppMessageLog.count({ where: { createdAt: { gte: from } } }),
    prisma.whatsAppMessageLog.groupBy({ by: ['status'], where: { createdAt: { gte: from } }, _count: { _all: true } }),
    prisma.whatsAppMessageLog.groupBy({ by: ['eventCode'], where: { createdAt: { gte: from } }, _count: { _all: true }, orderBy: { _count: { eventCode: 'desc' } }, take: limit }),
    prisma.whatsAppMessageLog.findMany({ where: { createdAt: { gte: from } }, orderBy: { createdAt: 'desc' }, take: limit, select: { eventCode: true, recipientType: true, status: true, errorCode: true, createdAt: true, sentAt: true, deliveredAt: true, readAt: true } }),
  ]);
  const hasFailures = byStatus.some((row) => row.status === 'FAILED' && row._count._all > 0);
  return {
    periodDays: days,
    integration: { enabled: Boolean(settings?.enabled), ready: Boolean(settings?.enabled && settings.phoneNumberId && settings.businessAccountId && settings.encryptedAccessToken && settings.encryptedWebhookVerifyToken && settings.encryptedAppSecret), graphApiVersion: settings?.graphApiVersion || null, updatedAt: iso(settings?.updatedAt) },
    templates: templates.map((row) => ({ status: row.status, count: row._count._all })),
    automationRules: rules.map((row) => ({ enabled: row.enabled, count: row._count._all })),
    campaigns: campaigns.map((row) => ({ name: row.name, category: row.category, status: row.status, template: row.template, recipients: row._count.recipients, createdAt: iso(row.createdAt) })),
    delivery: { total, byStatus: byStatus.map((row) => ({ status: row.status, count: row._count._all })), byEvent: events.map((row) => ({ event: row.eventCode, count: row._count._all })) },
    recentLogs: recent.map((row) => ({ eventCode: row.eventCode, recipientType: row.recipientType, status: row.status, errorCode: row.errorCode, createdAt: iso(row.createdAt), sentAt: iso(row.sentAt), deliveredAt: iso(row.deliveredAt), readAt: iso(row.readAt) })),
    hasFailures,
    maskedFields: ['recipientPhone', 'payloadSnapshot', 'errorMessage', 'providerMessageId', 'accessToken', 'webhookVerifyToken', 'appSecret', 'audienceFilters'],
  };
};

const smsPage = async (days: number, limit: number) => {
  const from = fromDays(days);
  const [settings, rules, total, byStatus, events, recent] = await Promise.all([
    prisma.smsIntegrationSettings.findUnique({ where: { id: 'default' }, select: { enabled: true, baseUrl: true, senderId: true, encryptedApiKey: true, updatedAt: true } }),
    prisma.smsAutomationRule.groupBy({ by: ['enabled'], _count: { _all: true } }),
    prisma.smsMessageLog.count({ where: { createdAt: { gte: from } } }),
    prisma.smsMessageLog.groupBy({ by: ['status'], where: { createdAt: { gte: from } }, _count: { _all: true } }),
    prisma.smsMessageLog.groupBy({ by: ['eventCode'], where: { createdAt: { gte: from } }, _count: { _all: true }, orderBy: { _count: { eventCode: 'desc' } }, take: limit }),
    prisma.smsMessageLog.findMany({ where: { createdAt: { gte: from } }, orderBy: { createdAt: 'desc' }, take: limit, select: { eventCode: true, recipientType: true, status: true, errorCode: true, createdAt: true, sentAt: true } }),
  ]);
  const hasFailures = byStatus.some((row) => row.status === 'FAILED' && row._count._all > 0);
  return {
    periodDays: days,
    integration: { enabled: Boolean(settings?.enabled), ready: Boolean(settings?.enabled && settings.senderId && settings.encryptedApiKey), baseUrlConfigured: Boolean(settings?.baseUrl), senderConfigured: Boolean(settings?.senderId), updatedAt: iso(settings?.updatedAt) },
    automationRules: rules.map((row) => ({ enabled: row.enabled, count: row._count._all })),
    delivery: { total, byStatus: byStatus.map((row) => ({ status: row.status, count: row._count._all })), byEvent: events.map((row) => ({ event: row.eventCode, count: row._count._all })) },
    recentLogs: recent.map((row) => ({ eventCode: row.eventCode, recipientType: row.recipientType, status: row.status, errorCode: row.errorCode, createdAt: iso(row.createdAt), sentAt: iso(row.sentAt) })),
    hasFailures,
    maskedFields: ['recipientPhone', 'payloadSnapshot', 'messageBody', 'errorMessage', 'providerMessageId', 'apiKey'],
  };
};

export const getAdministrationAiPageData = async (_context: unknown, args: AdministrationPageArguments) => {
  const days = boundedDays(args.days);
  const limit = boundedLimit(args.limit);
  const data = args.pageKey === 'users'
    ? await usersPage(limit)
    : args.pageKey === 'roles'
      ? await rolesPage(limit)
      : args.pageKey === 'settings'
        ? await settingsPage()
        : args.pageKey === 'whatsapp'
          ? await whatsappPage(days, limit)
          : await smsPage(days, limit);
  return {
    pageKey: args.pageKey,
    questionKeys: administrationPageQuestionKeys(args.pageKey),
    permissions: administrationPagePermissionsFor(args.pageKey),
    data,
    insights: insightFor(args.pageKey, data as Record<string, unknown>),
    relatedModules: args.pageKey === 'users' || args.pageKey === 'roles' ? ['Administration / Settings', 'Audit logs', 'AI access control'] : ['Administration / Settings', 'Notifications', 'Recruitment', 'CRM'],
  };
};
