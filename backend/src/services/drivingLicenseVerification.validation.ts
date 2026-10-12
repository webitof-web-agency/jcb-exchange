const MIN_LICENSE_LENGTH = 3;
const MAX_LICENSE_LENGTH = 50;

export const normalizeDrivingLicenseNumber = (value: unknown) =>
  typeof value === 'string' ? value.trim().toUpperCase().replace(/\s+/g, '') : '';

export const validateDrivingLicenseNumber = (value: unknown) => {
  const licenseNumber = normalizeDrivingLicenseNumber(value);
  if (!licenseNumber) return 'Driving license number is required.';
  if (licenseNumber.length < MIN_LICENSE_LENGTH || licenseNumber.length > MAX_LICENSE_LENGTH) {
    return 'Enter a valid driving license number.';
  }
  if (!/^[A-Z0-9/-]+$/.test(licenseNumber)) return 'Enter a valid driving license number.';
  return null;
};

const dateFromParts = (year: number, month: number, day: number) => {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) return null;
  return date;
};

export const normalizeDateOfBirth = (value: unknown) => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalized);
  const localMatch = /^(\d{2})[/-](\d{2})[/-](\d{4})$/.exec(normalized);
  const year = isoMatch ? Number(isoMatch[1]) : localMatch ? Number(localMatch[3]) : NaN;
  const month = isoMatch ? Number(isoMatch[2]) : localMatch ? Number(localMatch[2]) : NaN;
  const day = isoMatch ? Number(isoMatch[3]) : localMatch ? Number(localMatch[1]) : NaN;
  const date = dateFromParts(year, month, day);
  if (!date || year < 1900) return null;

  const today = new Date();
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  if (date.getTime() > todayUtc) return null;
  return date.toISOString().slice(0, 10);
};

export const validateDateOfBirth = (value: unknown) =>
  normalizeDateOfBirth(value) ? null : 'Enter a valid date of birth.';
