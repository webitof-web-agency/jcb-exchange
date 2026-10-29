// Account lockout for password login: after MAX_FAILURES wrong passwords for the same email within the
// window, password login for that email is refused until the lock expires. OTP and Google login stay open,
// so a staff member locked out by someone guessing their password can still sign in.
// Kept in memory (resets on server restart); the email is tracked whether or not an account exists,
// so the response never reveals which emails are registered.

export const MAX_FAILURES = 5;
export const LOCK_MS = 15 * 60 * 1000;

type Entry = { failures: number; firstFailureAt: number; lockedUntil: number };

const entries = new Map<string, Entry>();
const MAX_ENTRIES = 50_000;

const keyFor = (identifier: string) => identifier.trim().toLowerCase();

/** Milliseconds left on the lock, or 0 when password login is allowed. */
export const loginLockRemainingMs = (identifier: string, now = Date.now()) => {
  const entry = entries.get(keyFor(identifier));
  if (!entry) return 0;
  if (entry.lockedUntil > now) return entry.lockedUntil - now;
  if (now - entry.firstFailureAt > LOCK_MS) entries.delete(keyFor(identifier));
  return 0;
};

export const recordLoginFailure = (identifier: string, now = Date.now()) => {
  const key = keyFor(identifier);
  const current = entries.get(key);
  const entry = !current || now - current.firstFailureAt > LOCK_MS || (current.lockedUntil && current.lockedUntil <= now)
    ? { failures: 0, firstFailureAt: now, lockedUntil: 0 }
    : current;
  entry.failures += 1;
  if (entry.failures >= MAX_FAILURES) entry.lockedUntil = now + LOCK_MS;
  entries.set(key, entry);

  if (entries.size > MAX_ENTRIES) {
    for (const [staleKey, value] of entries) if (value.lockedUntil <= now && now - value.firstFailureAt > LOCK_MS) entries.delete(staleKey);
  }
};

export const clearLoginFailures = (identifier: string) => {
  entries.delete(keyFor(identifier));
};
