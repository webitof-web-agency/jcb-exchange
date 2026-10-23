const getResponseStatus = (error) => error?.response?.status;

export const isUsableAuthToken = (token, now = Date.now()) => {
  if (typeof token !== 'string' || !token.trim()) {
    return false;
  }

  try {
    const payloadPart = token.split('.')[1];
    if (!payloadPart) {
      return false;
    }

    const normalizedPayload = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
    const paddedPayload = normalizedPayload.padEnd(
      normalizedPayload.length + ((4 - (normalizedPayload.length % 4)) % 4),
      '=',
    );
    const payload = JSON.parse(atob(paddedPayload));

    return typeof payload.exp === 'number' && Number.isFinite(payload.exp) && payload.exp * 1000 > now;
  } catch {
    return false;
  }
};

export const isAuthenticationFailure = (error) => {
  const status = getResponseStatus(error);
  const code = error?.response?.data?.code;

  return status === 401 || (status === 403 && (code === 'ACCOUNT_REVOKED' || code === 'ACCOUNT_INACTIVE'));
};

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

export const hasAuthorizationHeader = (headers) => {
  return Boolean(getAuthorizationHeader(headers));
};

export const isCurrentAuthToken = (requestToken, currentToken) =>
  typeof requestToken === 'string' &&
  Boolean(requestToken) &&
  typeof currentToken === 'string' &&
  Boolean(currentToken) &&
  requestToken === currentToken;

export const getStoredAuthToken = (headers, storedToken) =>
  hasAuthorizationHeader(headers) ? null : storedToken;
