const DEFINITIVE_ACCOUNT_FAILURE_CODES = new Set([
  'SESSION_REVOKED',
  'ACCOUNT_INACTIVE',
  'ACCOUNT_REVOKED',
]);

export const isDefinitiveSessionFailure = (error) => {
  const response = error?.response;
  const status = response?.status;

  if (status === 401) {
    return true;
  }

  if (status !== 403) {
    return false;
  }

  const code = response?.data?.code;
  const message = String(response?.data?.error || '').toLowerCase();

  return (
    DEFINITIVE_ACCOUNT_FAILURE_CODES.has(code) ||
    message.includes('inactive') ||
    message.includes('deactivated')
  );
};
