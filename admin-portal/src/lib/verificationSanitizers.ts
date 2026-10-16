/**
 * Input sanitizers for Identity Hub and Vehicle & Transport verification card forms.
 * Prevents invalid characters, control symbols, and script injection while ensuring
 * inputs strictly adhere to verified formats and normalize cleanly.
 */

const cleanSpaces = (value: string, finalize = false) => {
  const collapsed = value.replace(/\s+/g, ' ');
  return finalize ? collapsed.trim() : collapsed.trimStart();
};

/**
 * Sanitizes PAN input: uppercase alphanumeric only, no spaces, max 10 chars.
 * Format: ABCDE1234F
 */
export const sanitizePan = (value: string, maxLength = 10): string => {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, maxLength);
};

/**
 * Sanitizes GSTIN input: uppercase alphanumeric only, no spaces, max 15 chars.
 * Format: 08AKWPJ1234H1ZN
 */
export const sanitizeGstin = (value: string, maxLength = 15): string => {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, maxLength);
};

/**
 * Sanitizes full name inputs: letters, spaces, dots, hyphens, and apostrophes only.
 * Disallows control characters, script tags, numbers, and dangerous symbols.
 * While typing (finalize=false), allows trailing space between words.
 * On blur/submit (finalize=true), trims trailing space.
 */
export const sanitizePersonName = (value: string, maxLength = 150, finalize = false): string => {
  const filtered = value.replace(/[^A-Za-z\s.'-]/g, '');
  return cleanSpaces(filtered, finalize).slice(0, maxLength);
};

/**
 * Sanitizes mobile numbers: digits only, max length (default 16 to allow prefixing).
 */
export const sanitizeMobileNumber = (value: string, maxLength = 16): string => {
  return value.replace(/\D/g, '').slice(0, maxLength);
};

/**
 * Sanitizes Driving License numbers: uppercase alphanumeric, '/', and '-' only, no spaces.
 * Format: UP2020150000000 or DL-0420110012345
 */
export const sanitizeDrivingLicenseNumber = (value: string, maxLength = 50): string => {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9/-]/g, '')
    .slice(0, maxLength);
};

/**
 * Sanitizes Vehicle Registration (RC) numbers: uppercase alphanumeric, '/', and '-' only, no spaces.
 * Format: RJ14XJ1234
 */
export const sanitizeRcNumber = (value: string, maxLength = 30): string => {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9/-]/g, '')
    .slice(0, maxLength);
};

/**
 * Sanitizes Chassis numbers: uppercase alphanumeric, '/', and '-' only, no spaces.
 */
export const sanitizeChassisNumber = (value: string, maxLength = 100): string => {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9/-]/g, '')
    .slice(0, maxLength);
};

/**
 * Sanitizes Engine numbers: uppercase alphanumeric, '/', '-', and '.' only, no spaces.
 */
export const sanitizeEngineNumber = (value: string, maxLength = 100): string => {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9/.-]/g, '')
    .slice(0, maxLength);
};

/**
 * Sanitizes search queries in verification history tables.
 */
export const sanitizeSearchInput = (value: string, maxLength = 50, finalize = false): string => {
  const filtered = value.replace(/[\u0000-\u001F\u007F]/g, '');
  return cleanSpaces(filtered, finalize).slice(0, maxLength);
};
