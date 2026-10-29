const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;

export const validatePasswordResetInput = (newPassword: string, confirmPassword: string): string | null => {
  if (!newPassword || !confirmPassword) {
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
