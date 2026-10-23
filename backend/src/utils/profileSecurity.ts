const PROFILE_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;

export type PasswordChangeInput = {
  newPassword?: unknown;
  confirmPassword?: unknown;
};

/**
 * Normalizes profile email input while keeping the database value canonical.
 * `null` is returned for omitted/empty values so callers can preserve the
 * current email rather than accidentally clearing it.
 */
export const normalizeProfileEmail = (value: unknown): string | null => {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  if (typeof value !== 'string') {
    throw new Error('Email address must be a string.');
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized.length > 254 || !PROFILE_EMAIL_PATTERN.test(normalized)) {
    throw new Error('Enter a valid email address.');
  }

  return normalized;
};

export const validatePasswordChangeInput = (
  input: PasswordChangeInput,
): string | null => {
  const { newPassword, confirmPassword } = input;

  if (typeof newPassword !== 'string' || typeof confirmPassword !== 'string' || !newPassword || !confirmPassword) {
    return 'New password and confirm password are required.';
  }

  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return `New password must be at least ${MIN_PASSWORD_LENGTH} characters long.`;
  }

  if (newPassword.length > MAX_PASSWORD_LENGTH) {
    return `New password must be ${MAX_PASSWORD_LENGTH} characters or fewer.`;
  }

  if (newPassword !== confirmPassword) {
    return 'New password and confirm password must match.';
  }

  return null;
};
