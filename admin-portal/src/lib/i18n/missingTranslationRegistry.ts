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
let failedAttempts = 0;
const MAX_RETRIES = 3;

// Keys already reported are remembered for a day so every page load does not report them again.
const SENT_STORAGE_KEY = 'jcbx:i18n-missing-sent';
const SENT_TTL_MS = 24 * 60 * 60 * 1000;
let storageLoaded = false;
const loadSentFromStorage = () => {
  if (storageLoaded || typeof window === 'undefined') return;
  storageLoaded = true;
  try {
    const stored = JSON.parse(window.localStorage.getItem(SENT_STORAGE_KEY) || 'null') as { at?: number; keys?: string[] } | null;
    if (stored?.at && Date.now() - stored.at < SENT_TTL_MS && Array.isArray(stored.keys)) stored.keys.forEach((key) => sentEntries.add(key));
  } catch {
    // Storage unavailable (private mode): fall back to per-page memory.
  }
};
const saveSentToStorage = () => {
  try {
    const stored = JSON.parse(window.localStorage.getItem(SENT_STORAGE_KEY) || 'null') as { at?: number } | null;
    const at = stored?.at && Date.now() - stored.at < SENT_TTL_MS ? stored.at : Date.now();
    window.localStorage.setItem(SENT_STORAGE_KEY, JSON.stringify({ at, keys: Array.from(sentEntries).slice(-2000) }));
  } catch {
    // ignore
  }
};

const resolveApiBaseUrl = () =>
  (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5002/api').replace(/\/$/, '');

const flushMissingTranslations = async (app: 'admin-portal' | 'frontend') => {
  flushTimer = null;

  const entries = Array.from(queuedEntries.values()).slice(0, REGISTRATION_BATCH_LIMIT);
  entries.forEach((entry) => queuedEntries.delete(entry.key));

  if (!entries.length) {
    return;
  }

  let retry = false;
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

    // 4xx (incl. 429 rate limit) will not succeed by repeating it: drop the batch instead of looping.
    retry = response.status >= 500;
    if (response.ok) {
      failedAttempts = 0;
      saveSentToStorage();
    }
  } catch {
    retry = true;
  }

  if (retry && failedAttempts < MAX_RETRIES) {
    failedAttempts += 1;
    entries.forEach((entry) => {
      if (!queuedEntries.has(entry.key)) queuedEntries.set(entry.key, entry);
    });
  }
  if (queuedEntries.size > 0 && flushTimer === null) {
    flushTimer = setTimeout(() => {
      void flushMissingTranslations(app);
    }, REGISTRATION_BATCH_WINDOW_MS * 2 ** failedAttempts);
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

  loadSentFromStorage();
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
