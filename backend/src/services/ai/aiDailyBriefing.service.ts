import { createHash } from 'node:crypto';

export const AI_DAILY_BRIEFING_TIMEZONE = 'Asia/Kolkata';
export const AI_DAILY_BRIEFING_MAX_ATTEMPTS = 5;
export const AI_DAILY_BRIEFING_LEASE_MS = 10 * 60 * 1000;
export const AI_DAILY_BRIEFING_MAX_RETRY_DELAY_MS = 6 * 60 * 60 * 1000;

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;
const SAFE_SCOPE_PART_PATTERN = /^[a-zA-Z0-9._:-]{1,80}$/u;

export const getBriefingDateKey = (date: Date = new Date()): string => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) throw new Error('A valid date is required.');
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: AI_DAILY_BRIEFING_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
};

export const getBriefingDateUtc = (dateKey: string): Date => {
  if (!DATE_KEY_PATTERN.test(dateKey)) throw new Error('Briefing date must use YYYY-MM-DD format.');
  const result = new Date(`${dateKey}T00:00:00.000Z`);
  if (Number.isNaN(result.getTime())) throw new Error('Briefing date is invalid.');
  return result;
};

export const getBriefingScopeKey = (tenantKey: string, userId: string): string => {
  if (!SAFE_SCOPE_PART_PATTERN.test(tenantKey) || !SAFE_SCOPE_PART_PATTERN.test(userId)) {
    throw new Error('Briefing scope contains invalid characters.');
  }
  return `${tenantKey}:user:${userId}`;
};

export const getRetryDelayMs = (attemptNumber: number): number => {
  const attempt = Math.max(1, Math.floor(attemptNumber));
  return Math.min(AI_DAILY_BRIEFING_MAX_RETRY_DELAY_MS, 60_000 * (2 ** (attempt - 1)));
};

export const hashBriefingSnapshot = (snapshot: unknown): string =>
  createHash('sha256').update(JSON.stringify(snapshot), 'utf8').digest('hex');

export const buildDailyBriefingPrompt = (dateKey: string): string => [
  `Prepare the internal JCB Exchange daily operations briefing for ${dateKey}.`,
  'Use only the supplied read-only operational snapshot as factual context.',
  'Do not expose personal contact details, passwords, tokens, financial account identifiers, or raw customer data.',
  'Do not claim that any approval, message, update, or other action was performed.',
  'Return concise plain text with these headings: Priority checks, Risks or exceptions, Key metrics, and Recommended human follow-ups.',
  'If a section has no data, say that it is unavailable instead of guessing. The read-only snapshot is supplied separately as tool context.',
].join('\n');
