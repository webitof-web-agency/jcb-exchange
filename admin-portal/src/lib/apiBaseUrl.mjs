/**
 * Accept either the API origin or its /api base path from deployment settings.
 * Every admin API request is served below /api.
 *
 * @param {string} configuredApiUrl
 * @returns {string}
 */
export const normalizeApiBaseUrl = (configuredApiUrl) => {
  const normalizedUrl = configuredApiUrl.trim().replace(/\/+$/, '');
  return normalizedUrl.endsWith('/api') ? normalizedUrl : `${normalizedUrl}/api`;
};
