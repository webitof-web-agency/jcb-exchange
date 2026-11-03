/**
 * Resolve the token used by browser API requests without exposing its value.
 * The store is the source of truth during navigation; localStorage is only a
 * recovery path for a hydration/module-boundary race.
 */
export const resolvePortalAuthToken = (stateToken, storage) => {
  if (typeof stateToken === 'string' && stateToken.trim()) {
    return stateToken;
  }

  try {
    const persistedToken = storage?.getItem('portal_token');
    return typeof persistedToken === 'string' && persistedToken.trim() ? persistedToken : null;
  } catch {
    return null;
  }
};
