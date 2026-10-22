import { Prisma } from '@prisma/client';
import prisma from '../../../lib/prisma';
import { PRIORITIES, type SlaMinutes, type WorkingHours } from '../rules';

export const CRM_SETTINGS_ID = 'default';

export type CrmConfig = {
  sources: string[];
  lostReasons: string[];
  tags: string[];
  /** Open leads must always carry a pending follow-up. */
  requireNextFollowUp: boolean;
  workingHours: WorkingHours;
  sla: SlaMinutes;
  reminders: { minutesBefore: number; inApp: boolean; push: boolean; whatsappToOwner: boolean; smsToOwner: boolean };
  missed: { graceMinutes: number; escalate: boolean; managerUserIds: string[] };
  automation: {
    /** Master switch for everything below; reminders/missed marking run regardless. */
    enabled: boolean;
    autoAssign: boolean;
    autoFirstFollowUp: boolean;
    firstFollowUpMinutes: number;
    slaEscalation: boolean;
    scoring: boolean;
    matchAlerts: boolean;
    reengagement: boolean;
    reengageAfterDays: number;
    customerReminders: boolean;
    leadAcknowledgement: boolean;
  };
  publicForms: { enabled: boolean };
  webhook: { enabled: boolean; keyHash: string | null; keyHint: string | null };
};

export const DEFAULT_CRM_CONFIG: CrmConfig = {
  sources: [
    'WEBSITE', 'DEALER_CALLBACK', 'PRIME_CONTACT', 'WEBSITE_FORM', 'WALK_IN', 'PHONE', 'WHATSAPP', 'REFERRAL',
    'INDIAMART', 'JUSTDIAL', 'FACEBOOK', 'INSTAGRAM', 'EXHIBITION', 'IMPORT', 'API', 'OTHER',
  ],
  lostReasons: [
    'Price too high', 'Bought elsewhere', 'Machine already sold', 'Not reachable', 'Budget mismatch',
    'Loan not approved', 'Just enquiring', 'Duplicate enquiry', 'Other',
  ],
  tags: ['Finance needed', 'Exchange', 'Urgent buyer', 'Repeat customer', 'Bulk buyer'],
  requireNextFollowUp: true,
  workingHours: { start: '09:30', end: '19:00', days: [1, 2, 3, 4, 5, 6] },
  sla: { URGENT: 15, HIGH: 60, MEDIUM: 240, LOW: 1440 },
  reminders: { minutesBefore: 15, inApp: true, push: true, whatsappToOwner: false, smsToOwner: false },
  missed: { graceMinutes: 120, escalate: true, managerUserIds: [] },
  automation: {
    enabled: false,
    autoAssign: false,
    autoFirstFollowUp: false,
    firstFollowUpMinutes: 30,
    slaEscalation: false,
    scoring: true,
    matchAlerts: false,
    reengagement: false,
    reengageAfterDays: 30,
    customerReminders: false,
    leadAcknowledgement: false,
  },
  publicForms: { enabled: true },
  webhook: { enabled: false, keyHash: null, keyHint: null },
};

const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const cleanList = (value: unknown, fallback: string[], max = 60) => {
  if (!Array.isArray(value)) return fallback;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value) {
    const text = String(item ?? '').trim().slice(0, 80);
    if (text && !seen.has(text.toLowerCase())) { seen.add(text.toLowerCase()); out.push(text); }
    if (out.length >= max) break;
  }
  return out;
};

const num = (value: unknown, fallback: number, min: number, max: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.round(parsed))) : fallback;
};

const bool = (value: unknown, fallback: boolean) => (typeof value === 'boolean' ? value : fallback);

const hhmm = (value: unknown, fallback: string) => (typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : fallback);

/** Merges a stored/patch object onto defaults, dropping anything malformed. */
export const normalizeCrmConfig = (raw: unknown, base: CrmConfig = DEFAULT_CRM_CONFIG): CrmConfig => {
  const input = isObject(raw) ? raw : {};
  const wh = isObject(input.workingHours) ? input.workingHours : {};
  const sla = isObject(input.sla) ? input.sla : {};
  const rem = isObject(input.reminders) ? input.reminders : {};
  const missed = isObject(input.missed) ? input.missed : {};
  const auto = isObject(input.automation) ? input.automation : {};
  const forms = isObject(input.publicForms) ? input.publicForms : {};
  const hook = isObject(input.webhook) ? input.webhook : {};
  const days = Array.isArray(wh.days)
    ? [...new Set(wh.days.map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))]
    : base.workingHours.days;
  const slaOut = { ...base.sla };
  for (const priority of PRIORITIES) slaOut[priority] = num(sla[priority], base.sla[priority], 5, 10080);
  return {
    sources: cleanList(input.sources, base.sources),
    lostReasons: cleanList(input.lostReasons, base.lostReasons),
    tags: cleanList(input.tags, base.tags, 100),
    requireNextFollowUp: bool(input.requireNextFollowUp, base.requireNextFollowUp),
    workingHours: { start: hhmm(wh.start, base.workingHours.start), end: hhmm(wh.end, base.workingHours.end), days },
    sla: slaOut,
    reminders: {
      minutesBefore: num(rem.minutesBefore, base.reminders.minutesBefore, 0, 1440),
      inApp: bool(rem.inApp, base.reminders.inApp),
      push: bool(rem.push, base.reminders.push),
      whatsappToOwner: bool(rem.whatsappToOwner, base.reminders.whatsappToOwner),
      smsToOwner: bool(rem.smsToOwner, base.reminders.smsToOwner),
    },
    missed: {
      graceMinutes: num(missed.graceMinutes, base.missed.graceMinutes, 15, 10080),
      escalate: bool(missed.escalate, base.missed.escalate),
      managerUserIds: cleanList(missed.managerUserIds, base.missed.managerUserIds, 20),
    },
    automation: {
      enabled: bool(auto.enabled, base.automation.enabled),
      autoAssign: bool(auto.autoAssign, base.automation.autoAssign),
      autoFirstFollowUp: bool(auto.autoFirstFollowUp, base.automation.autoFirstFollowUp),
      firstFollowUpMinutes: num(auto.firstFollowUpMinutes, base.automation.firstFollowUpMinutes, 5, 1440),
      slaEscalation: bool(auto.slaEscalation, base.automation.slaEscalation),
      scoring: bool(auto.scoring, base.automation.scoring),
      matchAlerts: bool(auto.matchAlerts, base.automation.matchAlerts),
      reengagement: bool(auto.reengagement, base.automation.reengagement),
      reengageAfterDays: num(auto.reengageAfterDays, base.automation.reengageAfterDays, 7, 365),
      customerReminders: bool(auto.customerReminders, base.automation.customerReminders),
      leadAcknowledgement: bool(auto.leadAcknowledgement, base.automation.leadAcknowledgement),
    },
    publicForms: { enabled: bool(forms.enabled, base.publicForms.enabled) },
    webhook: {
      enabled: bool(hook.enabled, base.webhook.enabled),
      keyHash: typeof hook.keyHash === 'string' ? hook.keyHash : base.webhook.keyHash,
      keyHint: typeof hook.keyHint === 'string' ? hook.keyHint : base.webhook.keyHint,
    },
  };
};

export const getCrmConfig = async (): Promise<CrmConfig> => {
  const row = await prisma.crmSettings.findUnique({ where: { id: CRM_SETTINGS_ID } });
  return normalizeCrmConfig(row?.config);
};

/** Patch merge: only keys present in `patch` change. The webhook key is managed separately. */
export const updateCrmConfig = async (patch: Record<string, unknown>, actorUserId: string) => {
  const current = await getCrmConfig();
  const { webhook: _ignored, ...rest } = patch;
  const merged = normalizeCrmConfig({ ...current, ...rest, webhook: current.webhook }, current);
  await prisma.crmSettings.upsert({
    where: { id: CRM_SETTINGS_ID },
    create: { id: CRM_SETTINGS_ID, config: merged as unknown as Prisma.InputJsonValue, updatedById: actorUserId },
    update: { config: merged as unknown as Prisma.InputJsonValue, updatedById: actorUserId },
  });
  return merged;
};

export const saveWebhookKey = async (keyHash: string | null, keyHint: string | null, enabled: boolean, actorUserId: string) => {
  const current = await getCrmConfig();
  const merged: CrmConfig = { ...current, webhook: { enabled, keyHash, keyHint } };
  await prisma.crmSettings.upsert({
    where: { id: CRM_SETTINGS_ID },
    create: { id: CRM_SETTINGS_ID, config: merged as unknown as Prisma.InputJsonValue, updatedById: actorUserId },
    update: { config: merged as unknown as Prisma.InputJsonValue, updatedById: actorUserId },
  });
  return merged;
};

export const readAutomationState = async () => {
  const row = await prisma.crmSettings.findUnique({ where: { id: CRM_SETTINGS_ID }, select: { automationState: true } });
  return (isObject(row?.automationState) ? row?.automationState : {}) as Record<string, unknown>;
};

export const writeAutomationState = async (state: Record<string, unknown>) => {
  await prisma.crmSettings.upsert({
    where: { id: CRM_SETTINGS_ID },
    create: { id: CRM_SETTINGS_ID, automationState: state as Prisma.InputJsonValue },
    update: { automationState: state as Prisma.InputJsonValue },
  });
};

/** Settings view for the UI: never exposes the webhook key hash. */
export const publicCrmConfig = (config: CrmConfig) => ({
  ...config,
  webhook: { enabled: config.webhook.enabled, configured: Boolean(config.webhook.keyHash), keyHint: config.webhook.keyHint },
});
