// Payroll rules (pure). Rates are the statutory defaults; confirm with the CA before the first run.

const round = (value: number) => Math.round(value * 100) / 100;
const rupee = (value: number) => Math.round(value);

export const PF_RATE = 0.12;
export const PF_ADMIN_RATE = 0.005;
export const EDLI_RATE = 0.005;
export const EPS_RATE = 0.0833;
export const PF_WAGE_CEILING = 15000;
export const ESI_WAGE_LIMIT = 21000;
export const ESI_EMPLOYEE_RATE = 0.0075;
export const ESI_EMPLOYER_RATE = 0.0325;

export type Earning = { code: string; name: string; amount: number; pfWage: boolean };

/** Monthly professional tax by state code (gross salary of the month). States not listed: 0. */
export const professionalTax = (stateCode: string | null | undefined, gross: number, month: string) => {
  const february = month.endsWith('-02');
  switch (stateCode) {
    case '27': // Maharashtra
      if (gross <= 7500) return 0;
      if (gross <= 10000) return 175;
      return february ? 300 : 200;
    case '29': // Karnataka
      return gross >= 25000 ? 200 : 0;
    case '24': // Gujarat
      return gross >= 12000 ? 200 : 0;
    case '36': // Telangana
    case '37': // Andhra Pradesh
      if (gross <= 15000) return 0;
      return gross <= 20000 ? 150 : 200;
    case '19': // West Bengal
      if (gross <= 10000) return 0;
      if (gross <= 15000) return 110;
      if (gross <= 25000) return 130;
      if (gross <= 40000) return 150;
      return 200;
    default:
      return 0;
  }
};

export const daysInMonth = (month: string) => {
  const [year, value] = month.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(year, value, 0)).getUTCDate();
};

/** Days of the month an employee was on the rolls (joining / leaving inside the month). */
export const daysEmployed = (month: string, joined: Date | null, left: Date | null) => {
  const [year, value] = month.split('-').map(Number) as [number, number];
  const start = new Date(Date.UTC(year, value - 1, 1));
  const end = new Date(Date.UTC(year, value, 0));
  const from = joined && joined > start ? joined : start;
  const to = left && left < end ? left : end;
  if (to < from) return 0;
  return Math.round((to.getTime() - from.getTime()) / 86400000) + 1;
};

export type PayslipInput = {
  month: string;
  earnings: Earning[];
  paidDays: number;
  additions: number;
  pfApplicable: boolean;
  pfWageCap: boolean;
  esiApplicable: boolean;
  ptState: string | null;
  tds: number;
  advanceDue: number;
};

/**
 * Pay for one month: earnings pro-rated by paid days, PF on PF wages (12% each side; employer
 * also pays 0.5% admin and 0.5% EDLI), ESI when the full-month gross is within ₹21,000
 * (rounded up to the rupee), state professional tax, TDS, then advance recovery (never below zero).
 */
export const computePayslip = (input: PayslipInput) => {
  const days = daysInMonth(input.month);
  const ratio = Math.min(Math.max(input.paidDays, 0), days) / days;
  const earnings = input.earnings.map((item) => ({ ...item, earned: round(item.amount * ratio) }));
  const fullGross = round(input.earnings.reduce((sum, item) => sum + item.amount, 0));
  const gross = round(earnings.reduce((sum, item) => sum + item.earned, 0) + input.additions);
  const pfBase = round(earnings.filter((item) => item.pfWage).reduce((sum, item) => sum + item.earned, 0));
  const pfWage = input.pfApplicable ? (input.pfWageCap ? Math.min(pfBase, PF_WAGE_CEILING) : pfBase) : 0;
  const employeePf = rupee(pfWage * PF_RATE);
  const employerPf = input.pfApplicable ? rupee(pfWage * PF_RATE) + rupee(pfWage * PF_ADMIN_RATE) + rupee(Math.min(pfWage, PF_WAGE_CEILING) * EDLI_RATE) : 0;
  const esiCovered = input.esiApplicable && fullGross <= ESI_WAGE_LIMIT && gross > 0;
  const employeeEsi = esiCovered ? Math.ceil(gross * ESI_EMPLOYEE_RATE) : 0;
  const employerEsi = esiCovered ? Math.ceil(gross * ESI_EMPLOYER_RATE) : 0;
  const pt = gross > 0 ? professionalTax(input.ptState, gross, input.month) : 0;
  const beforeAdvance = round(gross - employeePf - employeeEsi - pt - input.tds);
  const advanceRecovery = round(Math.max(Math.min(input.advanceDue, beforeAdvance), 0));
  return {
    daysInMonth: days,
    earnings,
    gross,
    pfWage: round(pfWage),
    eps: input.pfApplicable ? rupee(Math.min(pfWage, PF_WAGE_CEILING) * EPS_RATE) : 0,
    employeePf,
    employerPf,
    employeeEsi,
    employerEsi,
    professionalTax: pt,
    tds: round(input.tds),
    advanceRecovery,
    net: round(beforeAdvance - advanceRecovery),
  };
};

/** Gratuity (Payment of Gratuity Act): 15/26 × last basic × completed years, after 5 years; over 6 months counts as a year. */
export const gratuity = (basic: number, joined: Date, left: Date) => {
  const months = (left.getUTCFullYear() - joined.getUTCFullYear()) * 12 + (left.getUTCMonth() - joined.getUTCMonth()) - (left.getUTCDate() < joined.getUTCDate() ? 1 : 0);
  const years = Math.floor(months / 12) + (months % 12 > 6 ? 1 : 0);
  if (months < 60) return { years, amount: 0 };
  return { years, amount: Math.min(round((15 / 26) * basic * years), 2000000) };
};
