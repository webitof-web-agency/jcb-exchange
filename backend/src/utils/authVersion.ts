export const DEFAULT_AUTH_VERSION = 0;

const isValidAuthVersion = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= DEFAULT_AUTH_VERSION;

export const normalizeAuthVersion = (value: unknown) =>
  isValidAuthVersion(value) ? value : DEFAULT_AUTH_VERSION;

export const isAuthVersionCurrent = (tokenVersion: unknown, currentVersion: unknown) => {
  const normalizedCurrentVersion = normalizeAuthVersion(currentVersion);

  if (tokenVersion === undefined || tokenVersion === null) {
    return normalizedCurrentVersion === DEFAULT_AUTH_VERSION;
  }

  return isValidAuthVersion(tokenVersion) && tokenVersion === normalizedCurrentVersion;
};
