/**
 * Pure rules for recruitment offers: which status changes are allowed, which offers may still be edited / deleted,
 * and how a salary breakup is checked and totalled. Shared by the controller and the tests.
 */

export const OFFER_STATUSES = ['DRAFT', 'SENT', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'WITHDRAWN'] as const;
export type OfferStatusValue = (typeof OFFER_STATUSES)[number];

/**
 * - SENT -> SENT is a resend (new link version, the old link stops working).
 * - DECLINED / EXPIRED -> SENT re-offers the same letter.
 * - ACCEPTED and WITHDRAWN are final: an accepted offer belongs to HRM (pre-joining), and a withdrawn one is closed.
 * - EXPIRED is set by HR by hand; nothing expires an offer on its own.
 */
const ALLOWED_TRANSITIONS: Record<OfferStatusValue, readonly OfferStatusValue[]> = {
  DRAFT: ['SENT', 'WITHDRAWN'],
  SENT: ['SENT', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'WITHDRAWN'],
  DECLINED: ['SENT', 'WITHDRAWN'],
  EXPIRED: ['SENT', 'WITHDRAWN'],
  ACCEPTED: [],
  WITHDRAWN: [],
};

export const isOfferStatus = (value: unknown): value is OfferStatusValue =>
  typeof value === 'string' && (OFFER_STATUSES as readonly string[]).includes(value);

export const canChangeOfferStatus = (from: OfferStatusValue, to: OfferStatusValue) => ALLOWED_TRANSITIONS[from].includes(to);

export const describeOfferStatusChangeBlock = (from: OfferStatusValue, to: OfferStatusValue): string | null => {
  if (canChangeOfferStatus(from, to)) return null;
  if (from === 'ACCEPTED') return 'This offer is already accepted and the person is in HRM onboarding. Manage them from HRM instead.';
  if (from === 'WITHDRAWN') return 'This offer was withdrawn. Create a new offer instead.';
  return `An offer cannot move from ${from.toLowerCase()} to ${to.toLowerCase()}.`;
};

/** An accepted or withdrawn offer is a record of what happened; it is not edited. */
export const canEditOffer = (status: OfferStatusValue) => status !== 'ACCEPTED' && status !== 'WITHDRAWN';

/** An accepted offer is part of the employee's history in HRM and is never deleted (withdraw instead). */
export const canDeleteOffer = (status: OfferStatusValue) => status !== 'ACCEPTED';

// ---- salary breakup ----

export const SALARY_COMPONENT_TYPES = ['EARNING', 'EMPLOYER_CONTRIBUTION'] as const;
export type SalaryComponentType = (typeof SALARY_COMPONENT_TYPES)[number];

/** Standard component codes, so payroll can rely on them later. Custom ones use OTHER_*. */
export const STANDARD_SALARY_COMPONENTS: ReadonlyArray<{ code: string; name: string; componentType: SalaryComponentType }> = [
  { code: 'BASIC', name: 'Basic salary', componentType: 'EARNING' },
  { code: 'HRA', name: 'House rent allowance', componentType: 'EARNING' },
  { code: 'CONVEYANCE', name: 'Conveyance allowance', componentType: 'EARNING' },
  { code: 'SPECIAL', name: 'Special allowance', componentType: 'EARNING' },
  { code: 'OTHER_ALLOWANCE', name: 'Other allowance', componentType: 'EARNING' },
  { code: 'PF_EMPLOYER', name: 'Employer PF contribution', componentType: 'EMPLOYER_CONTRIBUTION' },
  { code: 'ESI_EMPLOYER', name: 'Employer ESI contribution', componentType: 'EMPLOYER_CONTRIBUTION' },
  { code: 'GRATUITY', name: 'Gratuity', componentType: 'EMPLOYER_CONTRIBUTION' },
];

export type SalaryComponent = { code: string; name: string; componentType: SalaryComponentType; monthlyAmount: number };

const roundMoney = (value: number) => Math.round(value * 100) / 100;

/**
 * Checks a submitted breakup and returns it cleaned, or the first problem. Amounts are monthly rupees; zero rows are
 * dropped; codes are unique; at least one earning is needed when a breakup is given.
 */
export const normalizeSalaryComponents = (raw: unknown): { components: SalaryComponent[] } | { error: string } => {
  if (raw === undefined || raw === null || raw === '') return { components: [] };
  let value: unknown = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      return { error: 'The salary breakup is not valid.' };
    }
  }
  if (!Array.isArray(value)) return { error: 'The salary breakup is not valid.' };
  if (value.length > 20) return { error: 'The salary breakup can have at most 20 rows.' };

  const components: SalaryComponent[] = [];
  const seen = new Set<string>();
  for (const row of value) {
    if (!row || typeof row !== 'object') return { error: 'The salary breakup is not valid.' };
    const item = row as Record<string, unknown>;
    const code = typeof item.code === 'string' ? item.code.trim().toUpperCase() : '';
    const name = typeof item.name === 'string' ? item.name.trim().replace(/\s+/g, ' ') : '';
    const componentType = item.componentType;
    const amount = typeof item.monthlyAmount === 'number' ? item.monthlyAmount : Number(String(item.monthlyAmount ?? '').replace(/,/g, ''));
    if (!/^[A-Z][A-Z0-9_]{1,39}$/.test(code)) return { error: 'Each salary row needs a code (letters, numbers, underscore).' };
    if (!name || name.length > 100) return { error: `Give the salary row ${code} a name (up to 100 characters).` };
    if (componentType !== 'EARNING' && componentType !== 'EMPLOYER_CONTRIBUTION') return { error: `Choose earning or employer contribution for ${name}.` };
    if (!Number.isFinite(amount) || amount < 0 || amount > 100_000_000) return { error: `Enter a valid monthly amount for ${name}.` };
    if (seen.has(code)) return { error: `${name} appears twice in the salary breakup.` };
    seen.add(code);
    if (amount === 0) continue;
    components.push({ code, name, componentType, monthlyAmount: roundMoney(amount) });
  }
  if (components.length && !components.some((component) => component.componentType === 'EARNING')) {
    return { error: 'The salary breakup needs at least one earning (for example Basic salary).' };
  }
  return { components };
};

/** Monthly gross (earnings), monthly CTC (earnings + employer contributions) and yearly CTC of a breakup. */
export const totalSalaryComponents = (components: readonly SalaryComponent[]) => {
  const grossMonthly = roundMoney(components.filter((c) => c.componentType === 'EARNING').reduce((sum, c) => sum + c.monthlyAmount, 0));
  const ctcMonthly = roundMoney(components.reduce((sum, c) => sum + c.monthlyAmount, 0));
  return { grossMonthly, ctcMonthly, annualCtc: roundMoney(ctcMonthly * 12) };
};

/** The yearly CTC from the amount on the letter and its period. */
export const annualCtcFrom = (amount: number, period: string | null | undefined) =>
  roundMoney(period === 'month' ? amount * 12 : amount);

/**
 * The reply-by day shown in messages (YYYY-MM-DD or ''): the Offer column, else the date written in the letter data,
 * the same rule as the candidate's offer page. Informational only: HR expires an offer by hand.
 */
export const offerValidUntilDay = (column: Date | null | undefined, letterData: unknown): string => {
  if (column) return column.toISOString().slice(0, 10);
  const value = letterData && typeof letterData === 'object' ? (letterData as { offerValidUntil?: unknown }).offerValidUntil : undefined;
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : '';
};
