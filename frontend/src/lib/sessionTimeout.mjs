export const DEFAULT_IDLE_TIMEOUT_MINUTES = 15;

export const parseIdleTimeoutMinutes = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_IDLE_TIMEOUT_MINUTES;
};

export const getIdleTimeoutMs = (value) =>
  parseIdleTimeoutMinutes(value) * 60 * 1000;

export const getWarningTimeoutMs = (timeoutMs) =>
  Math.min(60 * 1000, Math.max(1000, Math.floor(timeoutMs / 3)));
