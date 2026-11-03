export const isUsableAuthToken = (token, now = Date.now()) => {
  if (typeof token !== 'string' || !token.trim()) return false;

  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return !payload.exp || payload.exp * 1000 > now;
  } catch {
    return false;
  }
};

export const isAuthenticationFailure = (error) => {
  const status = error?.response?.status;
  return status === 401 || status === 403;
};
