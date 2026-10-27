export const DEFAULT_FETCH_TIMEOUT_MS = 8_000;

/**
 * Run fetch with a bounded deadline while still respecting a caller-provided
 * AbortSignal. This keeps SSR and browser navigation from waiting forever on
 * a stalled API connection.
 *
 * @param {RequestInfo | URL} input
 * @param {RequestInit} [init]
 * @param {number} [timeoutMs]
 * @returns {Promise<Response>}
 */
export const fetchWithTimeout = async (
  input,
  init = {},
  timeoutMs = DEFAULT_FETCH_TIMEOUT_MS,
) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const externalSignal = init.signal;

  const abortFromCaller = () => {
    controller.abort(externalSignal?.reason);
  };

  if (externalSignal) {
    if (externalSignal.aborted) {
      abortFromCaller();
    } else {
      externalSignal.addEventListener('abort', abortFromCaller, { once: true });
    }
  }

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
    externalSignal?.removeEventListener('abort', abortFromCaller);
  }
};
