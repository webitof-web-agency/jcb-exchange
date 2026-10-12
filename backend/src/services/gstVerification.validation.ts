export const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][A-Z0-9]Z[A-Z0-9]$/;

export const normalizeGstin = (value: unknown) =>
  typeof value === 'string' ? value.trim().toUpperCase() : '';

export const validateGstin = (value: unknown) => {
  const gstin = normalizeGstin(value);
  if (!gstin) return 'GSTIN is required.';
  if (gstin.length !== 15) return 'GSTIN must contain exactly 15-character length.';
  if (!GSTIN_PATTERN.test(gstin)) return 'Enter a valid GSTIN.';
  return null;
};
