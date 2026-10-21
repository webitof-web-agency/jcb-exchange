// Indian financial year helpers (April–March). Ledger dates are calendar dates, so every
// value here is a UTC-midnight Date, the same convention parseFinanceDate() uses.

const IST_OFFSET_MS = 330 * 60 * 1000;
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const utcDate = (year: number, monthIndex: number, day: number) => new Date(Date.UTC(year, monthIndex, day));

/** Today's calendar date in India, as UTC midnight. */
export const istToday = (now = new Date()) => {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  return utcDate(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate());
};

/** FY start year: 2026-04-01 … 2027-03-31 → 2026. */
export const financialYearStartYear = (date: Date) =>
  date.getUTCMonth() >= 3 ? date.getUTCFullYear() : date.getUTCFullYear() - 1;

export const financialYearLabel = (startYear: number) =>
  `FY ${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;

export const financialYearOf = (date: Date) => {
  const startYear = financialYearStartYear(date);
  return {
    startYear,
    label: financialYearLabel(startYear),
    startDate: utcDate(startYear, 3, 1),
    endDate: utcDate(startYear + 1, 2, 31),
  };
};

/** FY quarter: Apr–Jun = Q1 … Jan–Mar = Q4. */
export const financialQuarterOf = (date: Date) => {
  const quarter = Math.floor(((date.getUTCMonth() + 9) % 12) / 3) + 1;
  return `Q${quarter}` as 'Q1' | 'Q2' | 'Q3' | 'Q4';
};

/** GST return period as filed on the portal: MMYYYY. */
export const gstReturnPeriod = (date: Date) =>
  `${String(date.getUTCMonth() + 1).padStart(2, '0')}${date.getUTCFullYear()}`;

/** The 12 monthly periods of an FY, in order. */
export const financialYearMonths = (startYear: number) =>
  Array.from({ length: 12 }, (_, index) => {
    const monthIndex = (3 + index) % 12;
    const year = index < 9 ? startYear : startYear + 1;
    const startDate = utcDate(year, monthIndex, 1);
    const endDate = utcDate(year, monthIndex + 1, 0);
    return { label: `${MONTH_LABELS[monthIndex]} ${year}`, startDate, endDate };
  });
