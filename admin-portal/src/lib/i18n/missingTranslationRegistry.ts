const REGISTRATION_BATCH_WINDOW_MS = 600;
const REGISTRATION_BATCH_LIMIT = 25;
const REGISTER_ENDPOINT = '/master/translations/register-missing';

type MissingTranslationEntry = {
  key: string;
  baseValue: string;
};

const queuedEntries = new Map<string, MissingTranslationEntry>();
const sentEntries = new Set<string>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

const resolveApiBaseUrl = () =>
  (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5002/api').replace(/\/$/, '');

const flushMissingTranslations = async (app: 'admin-portal' | 'frontend') => {
  flushTimer = null;

  const entries = Array.from(queuedEntries.values()).slice(0, REGISTRATION_BATCH_LIMIT);
  entries.forEach((entry) => queuedEntries.delete(entry.key));

  if (!entries.length) {
    return;
  }

  try {
    const response = await fetch(`${resolveApiBaseUrl()}${REGISTER_ENDPOINT}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        app,
        entries,
      }),
      keepalive: true,
    });

    if (!response.ok) {
      throw new Error('Failed to register missing translations.');
    }
  } catch {
    entries.forEach((entry) => {
      if (!queuedEntries.has(entry.key)) {
        queuedEntries.set(entry.key, entry);
      }
      sentEntries.delete(entry.key);
    });
  } finally {
    if (queuedEntries.size > 0 && flushTimer === null) {
      flushTimer = setTimeout(() => {
        void flushMissingTranslations(app);
      }, REGISTRATION_BATCH_WINDOW_MS);
    }
  }
};

export const queueMissingTranslationRegistration = (
  app: 'admin-portal' | 'frontend',
  key: string,
  baseValue: string,
) => {
  if (typeof window === 'undefined') {
    return;
  }

  const normalizedKey = key.trim();
  const normalizedBaseValue = baseValue.trim();

  if (!normalizedKey || !normalizedBaseValue || sentEntries.has(normalizedKey)) {
    return;
  }

  sentEntries.add(normalizedKey);
  queuedEntries.set(normalizedKey, {
    key: normalizedKey,
    baseValue: normalizedBaseValue,
  });

  if (flushTimer !== null) {
    return;
  }

  flushTimer = setTimeout(() => {
    void flushMissingTranslations(app);
  }, REGISTRATION_BATCH_WINDOW_MS);
};
