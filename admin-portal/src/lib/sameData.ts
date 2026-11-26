/** Structural equality of JSON-like data. The order of object keys does not matter; the order of array items does. */
export const isSameData = (a: unknown, b: unknown): boolean => {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((item, index) => isSameData(item, b[index]));
  }
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = Object.keys(left).filter((key) => left[key] !== undefined);
  const otherKeys = Object.keys(right).filter((key) => right[key] !== undefined);
  return keys.length === otherKeys.length && keys.every((key) => isSameData(left[key], right[key]));
};

const comparableUser = (user: object) => {
  const copy: Record<string, unknown> = { ...(user as Record<string, unknown>) };
  // The row's own timestamp moves without anything the portal shows or allows having changed.
  delete copy.updatedAt;
  if (Array.isArray(copy.permissions)) copy.permissions = [...copy.permissions].sort();
  return copy;
};

/**
 * The same signed-in person with the same details and access. The session check runs every minute and returns a fresh
 * copy of the user; pages reload their data when the user object changes, so an identical copy must not replace it.
 */
export const isSameSessionUser = (current: object | null | undefined, next: object | null | undefined) => {
  if (!current || !next) return current === next;
  return isSameData(comparableUser(current), comparableUser(next));
};
