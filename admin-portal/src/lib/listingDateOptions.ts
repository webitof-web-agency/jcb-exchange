const currentYear = new Date().getFullYear();
const earliestRegistrationYear = 1980;

export const REGISTRATION_YEAR_OPTIONS = Array.from(
  { length: currentYear - earliestRegistrationYear + 2 },
  (_, index) => String(currentYear + 1 - index),
).filter((year) => Number(year) >= earliestRegistrationYear);

export const YEAR_SELECT_OPTIONS = REGISTRATION_YEAR_OPTIONS.map((year) => ({
  id: year,
  name: year,
}));
