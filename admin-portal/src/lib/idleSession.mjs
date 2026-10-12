export const getActivityStorageKey = (storageKey) => `${storageKey}:last_activity`;

export const getStoredActivityAt = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const shouldAcceptActivityAt = (currentActivityAt, incomingActivityAt) =>
  Number.isFinite(incomingActivityAt) && incomingActivityAt > currentActivityAt;

export const getIdleSessionState = (lastActivityAt, now, timeoutMs, warningMs) => {
  const elapsedMs = Math.max(0, now - lastActivityAt);
  const remainingMs = timeoutMs - elapsedMs;

  return {
    remainingMs,
    shouldWarn: remainingMs > 0 && remainingMs <= warningMs,
    shouldLogout: remainingMs <= 0,
  };
};
