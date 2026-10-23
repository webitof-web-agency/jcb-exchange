type UniqueConstraintError = {
  code?: unknown;
  meta?: {
    target?: unknown;
  };
};

type AuthUniqueConstraintContext = 'register' | 'profile' | 'admin';

const readConstraintTarget = (error: unknown) => {
  if (!error || typeof error !== 'object') {
    return '';
  }

  const candidate = error as UniqueConstraintError;
  if (candidate.code !== 'P2002') {
    return '';
  }

  const target = candidate.meta?.target;
  if (Array.isArray(target)) {
    return target.map((field) => String(field)).join(' ').toLowerCase();
  }

  return typeof target === 'string' ? target.toLowerCase() : '';
};

export const getAuthUniqueConstraintMessage = (
  error: unknown,
  context: AuthUniqueConstraintContext,
) => {
  const target = readConstraintTarget(error);
  if (!target) {
    return null;
  }

  if (target.includes('email')) {
    return context === 'register'
      ? 'Email address is already registered.'
      : 'Email address is already in use.';
  }

  if (target.includes('mobile')) {
    return context === 'register'
      ? 'Mobile number is already registered.'
      : 'Mobile number is already in use.';
  }

  return context === 'register'
    ? 'An account with these details already exists.'
    : 'An account with these details is already in use.';
};
