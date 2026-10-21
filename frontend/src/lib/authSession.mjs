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

export const hasAuthorizationHeader = (headers) => {
  if (!headers) {
    return false;
  }

  if (typeof headers.get === 'function') {
    return Boolean(headers.get('Authorization') || headers.get('authorization'));
  }

  return Boolean(headers.Authorization || headers.authorization);
};

export const getStoredAuthToken = (headers, storedToken) =>
  hasAuthorizationHeader(headers) ? null : storedToken;
