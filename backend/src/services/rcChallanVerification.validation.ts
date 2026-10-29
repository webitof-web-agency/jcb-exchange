export type RcChallanRequest = {
  rc_number: string;
};

const normalizeIdentifier = (value: unknown) =>
  typeof value === 'string' ? value.trim().toUpperCase().replace(/\s+/g, '') : '';

const hasControlCharacters = (value: string) => /[\u0000-\u001F\u007F]/.test(value);

export const normalizeRcChallanRequest = (input: Record<string, unknown>): RcChallanRequest => {
  return {
    rc_number: normalizeIdentifier(input.rc_number ?? input.rcNumber),
  };
};

const validateIdentifier = (label: string, value: string, maxLength: number) => {
  if (!value) return `${label} is required.`;
  if (value.length > maxLength || hasControlCharacters(value)) return `${label} is invalid.`;
  return null;
};

export const validateRcChallanRequest = (input: Record<string, unknown>) => {
  const normalized = normalizeRcChallanRequest(input);
  const rcError = validateIdentifier('Registration number', normalized.rc_number, 30);
  if (rcError) return rcError;
  return null;
};
