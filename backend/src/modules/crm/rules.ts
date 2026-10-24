// Pure CRM rules (no database). Tested in rules.test.ts.

export const LEAD_STATUSES = [
  'NEW',
  'CONTACTED',
  'QUALIFIED',
  'INTERESTED',
  'INSPECTION_SCHEDULED',
  'NEGOTIATION',
  'ON_HOLD',
  'WON',
  'LOST',
] as const;
export type LeadStatusValue = (typeof LEAD_STATUSES)[number];

export const CLOSED_STATUSES: readonly LeadStatusValue[] = ['WON', 'LOST'];
export const OPEN_STATUSES: readonly LeadStatusValue[] = LEAD_STATUSES.filter((status) => !CLOSED_STATUSES.includes(status));

export const LEAD_TYPES = ['BUY', 'SELL', 'FINANCE', 'INSURANCE', 'RTO', 'TRANSPORT', 'DEALER_ONBOARDING', 'PRIME', 'VERIFICATION', 'OTHER'] as const;
export const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
export const TEMPERATURES = ['HOT', 'WARM', 'COLD'] as const;
export const FOLLOW_UP_TYPES = ['CALL', 'WHATSAPP', 'SMS', 'VISIT', 'INSPECTION', 'MEETING', 'EMAIL', 'PAYMENT', 'OTHER'] as const;
export const FOLLOW_UP_OUTCOMES = [
  'CONNECTED',
  'NOT_REACHABLE',
  'BUSY',
  'SWITCHED_OFF',
  'CALL_BACK_LATER',
  'INTERESTED',
  'NOT_INTERESTED',
  'WRONG_NUMBER',
  'VISITED',
  'NO_SHOW',
  'MESSAGE_SENT',
  'OTHER',
] as const;
export const LIFECYCLES = ['LEAD', 'PROSPECT', 'CUSTOMER', 'INACTIVE'] as const;

export const isClosedStatus = (status: string) => (CLOSED_STATUSES as readonly string[]).includes(status);

export const oneOf = <T extends string>(values: readonly T[], value: unknown): T | null => {
  const normalized = String(value ?? '').trim().toUpperCase();
  return (values as readonly string[]).includes(normalized) ? (normalized as T) : null;
};

// ───────────── Phones ─────────────

/** Indian mobile → 10 digits (drops +91 / 91 / leading 0). Null when it is not a valid mobile. */
export const normalizeMobile = (value: unknown): string | null => {
  let digits = String(value ?? '').replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return /^[6-9]\d{9}$/.test(digits) ? digits : null;
};

/** Stored phone formats seen across the app, for lookups by phone. */
export const mobileVariants = (mobile: string) => [mobile, `91${mobile}`, `+91${mobile}`, `0${mobile}`, `+91 ${mobile}`];

// ───────────── Time (IST) ─────────────

const IST_OFFSET_MS = 330 * 60 * 1000;

/** Start of the IST calendar day containing `date`, as a UTC instant. */
export const istDayStart = (date: Date) => {
  const shifted = new Date(date.getTime() + IST_OFFSET_MS);
  shifted.setUTCHours(0, 0, 0, 0);
  return new Date(shifted.getTime() - IST_OFFSET_MS);
};

export const addMinutes = (date: Date, minutes: number) => new Date(date.getTime() + minutes * 60 * 1000);
export const addDays = (date: Date, days: number) => addMinutes(date, days * 24 * 60);

export type WorkingHours = { start: string; end: string; days: number[] };

const minutesOf = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map((part) => Number(part));
  return (h ?? 0) * 60 + (m ?? 0);
};

/** Moves a due time into working hours (IST): after hours → next working day's start. */
export const fitWorkingHours = (date: Date, hours: WorkingHours) => {
  const startMinutes = minutesOf(hours.start);
  const endMinutes = minutesOf(hours.end);
  const workingDays = hours.days.length ? hours.days : [1, 2, 3, 4, 5, 6];
  let candidate = new Date(date);
  for (let guard = 0; guard < 8; guard += 1) {
    const dayStart = istDayStart(candidate);
    const minuteOfDay = Math.floor((candidate.getTime() - dayStart.getTime()) / 60000);
    const weekday = new Date(dayStart.getTime() + IST_OFFSET_MS).getUTCDay();
    if (workingDays.includes(weekday) && minuteOfDay <= endMinutes) {
      return minuteOfDay < startMinutes ? addMinutes(dayStart, startMinutes) : candidate;
    }
    // Closed day or after hours: try the next day's opening time.
    candidate = addMinutes(addDays(dayStart, 1), startMinutes);
  }
  return candidate;
};

// ───────────── SLA & follow-ups ─────────────

export type SlaMinutes = Record<(typeof PRIORITIES)[number], number>;

export const slaDueAt = (createdAt: Date, priority: string, sla: SlaMinutes) => {
  const minutes = sla[(oneOf(PRIORITIES, priority) ?? 'MEDIUM')] ?? sla.MEDIUM;
  return addMinutes(createdAt, minutes);
};

export type FollowUpBucket = 'OVERDUE' | 'TODAY' | 'UPCOMING' | 'CLOSED';

export const followUpBucket = (followUp: { status: string; dueAt: Date }, now: Date): FollowUpBucket => {
  if (followUp.status !== 'PENDING') return 'CLOSED';
  if (followUp.dueAt.getTime() < now.getTime()) return 'OVERDUE';
  const tomorrow = addDays(istDayStart(now), 1);
  return followUp.dueAt.getTime() < tomorrow.getTime() ? 'TODAY' : 'UPCOMING';
};

export const isReminderDue = (
  followUp: { status: string; dueAt: Date; remindedAt: Date | null },
  now: Date,
  minutesBefore: number,
) => followUp.status === 'PENDING' && !followUp.remindedAt && followUp.dueAt.getTime() - minutesBefore * 60000 <= now.getTime();

/** A pending follow-up becomes MISSED once it is this many minutes past due. */
export const isMissed = (followUp: { status: string; dueAt: Date }, now: Date, graceMinutes: number) =>
  followUp.status === 'PENDING' && followUp.dueAt.getTime() + graceMinutes * 60000 < now.getTime();

/** Open leads must always have a next step (unless the setting is off). */
export const needsNextFollowUp = (
  status: string,
  requireNext: boolean,
  terminalStatuses: readonly string[] = CLOSED_STATUSES,
) => requireNext && !terminalStatuses.includes(status);

// ───────────── Scoring ─────────────

export type ScoreSignals = {
  priority: string;
  isPrime: boolean;
  repeatEnquiries: number;
  listingViews30d: number;
  contactClicks30d: number;
  hasBudget: boolean;
  hasRequirement: boolean;
  source: string;
  daysSinceLastActivity: number | null;
  status: string;
};

const WARM_SOURCES = ['WALK_IN', 'REFERRAL', 'PHONE', 'WHATSAPP', 'DEALER_CALLBACK'];

export const scoreLead = (signals: ScoreSignals) => {
  let score = 20;
  score += ({ LOW: -5, MEDIUM: 0, HIGH: 10, URGENT: 20 } as Record<string, number>)[signals.priority] ?? 0;
  if (signals.isPrime) score += 20;
  score += Math.min(signals.repeatEnquiries, 3) * 8;
  score += Math.min(signals.listingViews30d, 10) * 1.5;
  score += Math.min(signals.contactClicks30d, 5) * 3;
  if (signals.hasBudget) score += 8;
  if (signals.hasRequirement) score += 5;
  if (WARM_SOURCES.includes(signals.source)) score += 7;
  score += ({ QUALIFIED: 5, INTERESTED: 10, INSPECTION_SCHEDULED: 15, NEGOTIATION: 20, ON_HOLD: -10 } as Record<string, number>)[signals.status] ?? 0;
  if (signals.daysSinceLastActivity !== null) {
    if (signals.daysSinceLastActivity > 30) score -= 20;
    else if (signals.daysSinceLastActivity > 14) score -= 10;
  }
  const bounded = Math.max(0, Math.min(100, Math.round(score)));
  const temperature = bounded >= 65 ? 'HOT' : bounded >= 40 ? 'WARM' : 'COLD';
  return { score: bounded, temperature } as const;
};

// ───────────── Assignment ─────────────

export type AssignmentConditions = {
  leadTypes?: string[];
  sources?: string[];
  states?: string[];
  cities?: string[];
  categoryIds?: string[];
  priorities?: string[];
};

export type AssignableLead = {
  leadType: string;
  source: string;
  priority: string;
  categoryId: string | null;
  state: string | null;
  city: string | null;
};

const matchesList = (allowed: string[] | undefined, value: string | null) =>
  !allowed?.length || (value !== null && allowed.map((item) => item.toLowerCase()).includes(value.toLowerCase()));

export const ruleMatchesLead = (conditions: AssignmentConditions | null | undefined, lead: AssignableLead) => {
  const c = conditions || {};
  return (
    matchesList(c.leadTypes, lead.leadType) &&
    matchesList(c.sources, lead.source) &&
    matchesList(c.priorities, lead.priority) &&
    matchesList(c.categoryIds, lead.categoryId) &&
    matchesList(c.states, lead.state) &&
    matchesList(c.cities, lead.city)
  );
};

/** Picks the assignee for a rule. `openLoad` maps userId → open leads (LEAST_LOAD). */
export const pickAssignee = (
  rule: { strategy: string; assigneeIds: string[]; cursor: number },
  activeUserIds: Set<string>,
  openLoad: Map<string, number>,
): { userId: string; nextCursor: number } | null => {
  const pool = rule.assigneeIds.filter((id) => activeUserIds.has(id));
  if (!pool.length) return null;
  if (rule.strategy === 'SPECIFIC_USER') return { userId: pool[0] as string, nextCursor: rule.cursor };
  if (rule.strategy === 'LEAST_LOAD') {
    const sorted = [...pool].sort((a, b) => (openLoad.get(a) ?? 0) - (openLoad.get(b) ?? 0) || pool.indexOf(a) - pool.indexOf(b));
    return { userId: sorted[0] as string, nextCursor: rule.cursor };
  }
  const index = ((rule.cursor % pool.length) + pool.length) % pool.length;
  return { userId: pool[index] as string, nextCursor: index + 1 };
};

// ───────────── Listing matching ─────────────

export type Requirement = {
  categoryId: string | null;
  brandId: string | null;
  modelId: string | null;
  yearFrom: number | null;
  yearTo: number | null;
  budgetMin: number | null;
  budgetMax: number | null;
  state: string | null;
  city: string | null;
};

export type MatchableListing = {
  categoryId: string;
  brandId: string;
  modelId: string;
  manufacturingYear: number;
  price: number;
  locationState: string;
  locationCity: string;
};

export const hasRequirement = (r: Requirement) =>
  Boolean(r.categoryId || r.brandId || r.modelId || r.yearFrom || r.yearTo || r.budgetMin || r.budgetMax);

/** Hard filters first (category/brand/model/year/budget with 10% headroom), then a 0–100 fit score. */
export const listingMatch = (r: Requirement, listing: MatchableListing): number | null => {
  if (r.categoryId && r.categoryId !== listing.categoryId) return null;
  if (r.brandId && r.brandId !== listing.brandId) return null;
  if (r.modelId && r.modelId !== listing.modelId) return null;
  if (r.yearFrom && listing.manufacturingYear < r.yearFrom) return null;
  if (r.yearTo && listing.manufacturingYear > r.yearTo) return null;
  if (r.budgetMax && listing.price > r.budgetMax * 1.1) return null;
  let score = 50;
  if (r.modelId) score += 15;
  else if (r.brandId) score += 8;
  if (r.budgetMax) score += listing.price <= r.budgetMax ? 15 : 5;
  if (r.budgetMin && listing.price >= r.budgetMin) score += 5;
  const sameState = Boolean(r.state && r.state.toLowerCase() === listing.locationState.toLowerCase());
  if (sameState) score += 8;
  if (sameState && r.city && r.city.toLowerCase() === listing.locationCity.toLowerCase()) score += 7;
  return Math.min(100, score);
};

// ───────────── CSV ─────────────

/** Small RFC 4180 parser (quotes, escaped quotes, CRLF). First row is the header. */
export const parseCsv = (text: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const source = text.replace(/^﻿/, '');
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i] as string;
    if (quoted) {
      if (ch === '"' && source[i + 1] === '"') { cell += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else cell += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && source[i + 1] === '\n') i += 1;
      row.push(cell); cell = '';
      if (row.some((value) => value.trim() !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((value) => value.trim() !== '')) rows.push(row);
  return rows;
};

export const toCsv = (rows: Array<Array<string | number | null | undefined>>) =>
  rows
    .map((row) => row.map((value) => {
      const text = value === null || value === undefined ? '' : String(value);
      // Neutralise spreadsheet formulas in exported cells.
      const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
      return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
    }).join(','))
    .join('\r\n');
