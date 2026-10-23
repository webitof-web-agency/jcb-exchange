const DEFINITIVE_ACCOUNT_FAILURE_CODES = new Set([
  'SESSION_REVOKED',
  'ACCOUNT_INACTIVE',
  'ACCOUNT_REVOKED',
]);

const getAuthorizationHeader = (headers) => {
  if (!headers) {
    return null;
  }

  if (typeof headers.get === 'function') {
    return headers.get('Authorization') || headers.get('authorization') || null;
  }

  return headers.Authorization || headers.authorization || null;
};

export const getAuthorizationToken = (headers) => {
  const authorization = getAuthorizationHeader(headers);
  if (typeof authorization !== 'string') {
    return null;
  }

  const value = authorization.trim();
  if (!value) {
    return null;
  }

  return value.replace(/^Bearer\s+/i, '').trim() || null;
};

export const isCurrentAuthToken = (requestToken, currentToken) =>
  typeof requestToken === 'string' &&
  Boolean(requestToken) &&
  typeof currentToken === 'string' &&
  Boolean(currentToken) &&
  requestToken === currentToken;

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
