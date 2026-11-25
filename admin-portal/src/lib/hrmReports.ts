import type { HrmHeadcountCounts, HrmOnboardingStatus, HrmReportSummary } from './hrmApi';

/**
 * Pure helpers for the HRM Reports page (Director dashboard): tiles, headcount table sorting and totals, the month
 * picker (Indian calendar) and CSV file names. No React, no API.
 */

export const OPEN_ONBOARDING: HrmOnboardingStatus[] = ['NEEDS_REVIEW', 'PENDING', 'IN_PROGRESS', 'READY_FOR_APPROVAL'];

export type ReportTile = { key: string; label: string; value: string; hint?: string; tone: 'slate' | 'emerald' | 'amber' | 'sky' | 'rose' };

/** "YYYY-MM" of today in India (between 00:00 and 05:30 IST the UTC month can still be the previous one). */
export const indiaMonth = (now = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit' }).format(now).slice(0, 7);

/** "YYYY-MM-DD" of today in India. */
export const indiaDay = (now = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);

export const isValidMonth = (value: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(value);

/** "November 2026" for "2026-11". */
export const monthLabel = (value: string) => {
  if (!isValidMonth(value)) return value;
  const [year, month] = value.split('-').map(Number);
  return new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(year!, month! - 1, 1)));
};

/** The month before / after "YYYY-MM". */
export const shiftMonth = (value: string, delta: number) => {
  const [year, month] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year!, month! - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
};

/** Open onboarding cases; null when the viewer may not see onboarding (no hrm.onboarding.read). */
export const openOnboardingCount = (onboarding: HrmReportSummary['onboarding']) =>
  onboarding ? OPEN_ONBOARDING.reduce((sum, status) => sum + (onboarding[status] ?? 0), 0) : null;

const formatNumber = (value: number) => new Intl.NumberFormat('en-IN').format(value);

export const buildReportTiles = (report: HrmReportSummary): ReportTile[] => {
  const tiles: ReportTile[] = [
    { key: 'working', label: 'Working', value: formatNumber(report.totals.working), hint: 'Active or on leave', tone: 'emerald' },
    { key: 'notice', label: 'On notice', value: formatNumber(report.totals.notice), tone: 'amber' },
    { key: 'joining', label: 'Joining', value: formatNumber(report.totals.joining), hint: 'Offer accepted, not joined yet', tone: 'sky' },
    { key: 'onHold', label: 'On hold', value: formatNumber(report.totals.onHold), hint: 'Suspended', tone: 'slate' },
  ];
  if (report.unplaced > 0) tiles.push({ key: 'unplaced', label: 'Unplaced', value: formatNumber(report.unplaced), hint: 'Working, but no assignment today', tone: 'rose' });
  tiles.push(
    { key: 'kyc', label: 'KYC complete', value: `${report.kyc.percent}%`, hint: `${formatNumber(report.kyc.complete)} of ${formatNumber(report.kyc.employees)} employees`, tone: report.kyc.percent >= 90 ? 'emerald' : report.kyc.percent >= 60 ? 'amber' : 'rose' },
    { key: 'vacant', label: 'Vacant states', value: formatNumber(report.vacantStates.length), hint: 'State offices without a working manager', tone: report.vacantStates.length ? 'rose' : 'emerald' },
    ...(report.onboarding ? [{ key: 'onboarding', label: 'Onboarding open', value: formatNumber(openOnboardingCount(report.onboarding) ?? 0), tone: 'sky' as const }] : []),
  );
  return tiles;
};

export type HeadcountSort = 'total' | 'name';
export type HeadcountRow = HrmHeadcountCounts & { key: string; name: string };

/** Sorted copy: by total (largest first, then name) or by name (A-Z). */
export const sortHeadcount = <T extends HeadcountRow>(rows: readonly T[], sort: HeadcountSort): T[] =>
  [...rows].sort((a, b) => (sort === 'total' ? b.total - a.total || a.name.localeCompare(b.name) : a.name.localeCompare(b.name)));

export const headcountTotals = (rows: readonly HrmHeadcountCounts[]): HrmHeadcountCounts =>
  rows.reduce<HrmHeadcountCounts>((sum, row) => ({
    working: sum.working + row.working,
    notice: sum.notice + row.notice,
    joining: sum.joining + row.joining,
    onHold: sum.onHold + row.onHold,
    total: sum.total + row.total,
  }), { working: 0, notice: 0, joining: 0, onHold: 0, total: 0 });

export const stateRows = (report: HrmReportSummary): Array<HeadcountRow & { stateId: number | null }> =>
  report.byState.map((row) => ({ ...row, key: String(row.stateId ?? 'none'), name: row.state }));

export const departmentRows = (report: HrmReportSummary): Array<HeadcountRow & { orgUnitId: string | null }> =>
  report.byDepartment.map((row) => ({ ...row, key: String(row.orgUnitId ?? 'none'), name: row.department }));

/** Width of a bar (0-100) relative to the largest total; at least 2% so a non-zero value stays visible. */
export const barPercent = (value: number, max: number) => {
  if (value <= 0 || max <= 0) return 0;
  return Math.max(2, Math.round((value / max) * 100));
};

export const headcountCsvFileName = (by: 'state' | 'department', now = new Date()) => `hrm-headcount-${by}-${indiaDay(now)}.csv`;

/** "Showing the first 200 of 312" when the server cut the list, otherwise null. */
export const describeTruncation = (shown: number, total: number) => (total > shown ? `Showing the first ${shown} of ${formatNumber(total)}.` : null);

/**
 * The month the "next" button moves to, never past the current month in India; also when the month input was
 * cleared (an empty / invalid value counts as the current month).
 */
export const nextReportMonth = (value: string, now = new Date()) => {
  const current = indiaMonth(now);
  const base = isValidMonth(value) ? value : current;
  const next = shiftMonth(base, 1);
  return { canGoNext: base < current, next: next > current ? current : next };
};

/**
 * The server's message from a failed blob download (the error body arrives as a Blob, so the usual JSON error
 * reader cannot see it). Falls back to `fallback`.
 */
export const readBlobErrorMessage = async (error: unknown, fallback: string): Promise<string> => {
  const data = (error as { response?: { data?: unknown } })?.response?.data;
  try {
    const text = data instanceof Blob ? await data.text() : typeof data === 'string' ? data : '';
    if (text) {
      const parsed = JSON.parse(text) as { error?: unknown; message?: unknown };
      const message = typeof parsed.error === 'string' ? parsed.error : typeof parsed.message === 'string' ? parsed.message : '';
      if (message.trim()) return message.trim();
    }
  } catch {
    // Not JSON: use the fallback below.
  }
  return fallback;
};

/** Link to the Onboarding page for a pipeline status, keeping the report's state / department filters. */
export const onboardingStatusHref = (base: string, status: string, filters: { stateId?: string; orgUnitId?: string }) => {
  const params = new URLSearchParams({ status });
  if (filters.stateId) params.set('stateId', filters.stateId);
  if (filters.orgUnitId) params.set('orgUnitId', filters.orgUnitId);
  return `${base}/onboarding?${params.toString()}`;
};
