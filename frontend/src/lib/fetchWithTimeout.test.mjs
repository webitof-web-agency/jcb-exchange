import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchWithTimeout } from './fetchWithTimeout.mjs';

test('aborts a fetch that exceeds its deadline', async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (_input, init = {}) => new Promise((_resolve, reject) => {
    init.signal?.addEventListener('abort', () => {
      const error = new Error('The request was aborted.');
      error.name = 'AbortError';
      reject(error);
    }, { once: true });
  });

  try {
    await assert.rejects(
      fetchWithTimeout('https://api.example.com/health', {}, 10),
      (error) => error?.name === 'AbortError',
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
