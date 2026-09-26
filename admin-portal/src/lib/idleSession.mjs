export const getIdleSessionState = (lastActivityAt, now, timeoutMs, warningMs) => {
  const elapsedMs = Math.max(0, now - lastActivityAt);
  const remainingMs = timeoutMs - elapsedMs;

  return {
    remainingMs,
    shouldWarn: remainingMs > 0 && remainingMs <= warningMs,
    shouldLogout: remainingMs <= 0,
  };
};
